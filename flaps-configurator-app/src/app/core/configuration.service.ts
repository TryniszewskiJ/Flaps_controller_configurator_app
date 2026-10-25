import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { clone, create, equals } from '@bufbuild/protobuf';
import { ConnectionService } from './connection.service';
import {
  CanFrame,
  Command,
  Configuration,
  ConfigurationError,
  ConfigurationSchema,
  FlapsState,
  GetConfigurationRequestSchema,
  GetConfigurationResponseSchema,
  SaveConfigurationRequestSchema,
  SaveConfigurationResponseSchema,
  SetConfigurationRequestSchema,
  SetConfigurationResponseSchema,
  Logic,
  Signal,
  Status,
} from './protocol/gen/flaps_pb';
import { ProtocolError, ProtocolTimeoutError } from './protocol/protocol-client';

/** Limity firmware (flaps_controller_configuration.h, flaps.options). */
export const MAX_FRAMES = 16;
export const MAX_SIGNALS = 16;
export const MAX_LOGICS = 10;
/** Bajty UTF-8, bez NUL. */
export const SIGNAL_NAME_MAX_BYTES = 15;
export const LOGIC_DESCRIPTION_MAX_BYTES = 31;
export const MAX_STANDARD_ID = 0x7ff;
export const MAX_EXTENDED_ID = 0x1fffffff;
export const MAX_FRAME_TIMEOUT_MS = 65535;
export const MIN_MOVE_TIME_MS = 50;
export const MAX_MOVE_TIME_MS = 5000;

/** SAVE_CONFIGURATION kasuje sektor flasha (1–2 s), urządzenie w tym czasie nie odpowiada. */
const SAVE_TIMEOUT_MS = 5000;

export type ConfigurationBusy = 'read' | 'apply' | 'save' | null;

/** Ustawienia ogólne — wszystko poza listami ramek, sygnałów i logik. */
export interface ConfigurationSettings {
  /** Brak = dokładnie jedna logika. */
  selectorSignal?: number;
  defaultLogicIndex: number;
  failSafeState: FlapsState;
  moveTimeMs: number;
  fdcanTermination: boolean;
}

/**
 * Konfiguracja sterownika (ramki → sygnały → selektor → logiki): odczyt GET_CONFIGURATION,
 * edycja wersji roboczej, test SET_CONFIGURATION (tylko RAM) i zapis SAVE_CONFIGURATION.
 */
@Injectable({ providedIn: 'root' })
export class ConfigurationService {
  private readonly connection = inject(ConnectionService);

  private readonly _draft = signal<Configuration | null>(null);
  /** Konfiguracja w użyciu na urządzeniu (ostatnio odczytana albo ustawiona). */
  private readonly _device = signal<Configuration | null>(null);
  private readonly _unsavedOnDevice = signal(false);
  private readonly _busy = signal<ConfigurationBusy>(null);
  private readonly _error = signal<string | null>(null);

  /** Wersja robocza edytowana w aplikacji. */
  readonly draft = this._draft.asReadonly();
  readonly busy = this._busy.asReadonly();
  /** Powód ostatniej nieudanej operacji. */
  readonly error = this._error.asReadonly();
  /** Wersja robocza różni się od konfiguracji w użyciu na urządzeniu. */
  readonly dirty = computed(() => {
    const draft = this._draft();
    const device = this._device();
    return !!draft && !!device && !equals(ConfigurationSchema, draft, device);
  });
  /** Konfiguracja w użyciu nie jest zapisana we flashu (zniknie po resecie). */
  readonly unsavedOnDevice = this._unsavedOnDevice.asReadonly();

  constructor() {
    effect(() => {
      const status = this.connection.status();
      untracked(() => {
        if (status === 'connected' && !this.dirty() && !this._busy()) {
          // Po połączeniu (także ponownym) — konfiguracja z urządzenia, o ile nie ma zmian
          void this.read();
        } else if (status === 'disconnected') {
          this.reset();
        }
      });
    });
  }

  /** GET_CONFIGURATION — odrzuca zmiany w wersji roboczej. */
  async read(): Promise<boolean> {
    return this.run('read', async () => {
      const reply = await this.connection.request(
        Command.GET_CONFIGURATION,
        GetConfigurationRequestSchema,
        {},
        GetConfigurationResponseSchema,
      );
      const configuration = reply.configuration ?? create(ConfigurationSchema);
      this._device.set(configuration);
      this._draft.set(clone(ConfigurationSchema, configuration));
      this._unsavedOnDevice.set(reply.unsavedChanges);
    });
  }

  /** SET_CONFIGURATION — urządzenie od razu używa wersji roboczej (do resetu albo zapisu). */
  async apply(): Promise<boolean> {
    const draft = this._draft();
    if (!draft) {
      return false;
    }
    return this.run('apply', () => this.setConfiguration(draft));
  }

  /** SAVE_CONFIGURATION — zapis do flasha; najpierw wysyła niezastosowane zmiany. */
  async save(): Promise<boolean> {
    const draft = this._draft();
    if (!draft) {
      return false;
    }
    return this.run('save', async () => {
      if (this.dirty()) {
        await this.setConfiguration(draft);
      }
      const reply = await this.connection.request(
        Command.SAVE_CONFIGURATION,
        SaveConfigurationRequestSchema,
        {},
        SaveConfigurationResponseSchema,
        { timeoutMs: SAVE_TIMEOUT_MS, retries: 0 },
      );
      if (reply.status !== Status.OK) {
        throw new Error('Nie udało się zapisać konfiguracji we flashu sterownika.');
      }
      this._unsavedOnDevice.set(false);
    });
  }

  /** Wraca do konfiguracji w użyciu na urządzeniu. */
  discard(): void {
    const device = this._device();
    this._draft.set(device ? clone(ConfigurationSchema, device) : null);
    this._error.set(null);
  }

  /** Nowa ramka (index null) albo zmiana istniejącej. */
  setFrame(index: number | null, frame: CanFrame): void {
    this.edit((config) => {
      if (index === null) {
        config.frames.push(frame);
      } else {
        config.frames[index] = frame;
      }
    });
  }

  /** Usuwa ramkę; null albo powód, dla którego nie można. */
  removeFrame(index: number): string | null {
    const config = this._draft();
    if (!config) {
      return null;
    }
    const used = config.signals.filter((signal) => signal.frameIndex === index);
    if (used.length > 0) {
      return `Ramkę odczytują sygnały: ${used.map((signal) => signal.name).join(', ')}. Usuń je najpierw.`;
    }

    this.edit((draft) => {
      draft.frames.splice(index, 1);
      for (const signal of draft.signals) {
        if (signal.frameIndex > index) {
          signal.frameIndex--;
        }
      }
    });
    return null;
  }

  /** Nowy sygnał (index null) albo zmiana istniejącego. */
  setSignal(index: number | null, signal: Signal): void {
    this.edit((config) => {
      if (index === null) {
        config.signals.push(signal);
      } else {
        config.signals[index] = signal;
      }
    });
  }

  /** Usuwa sygnał; null albo powód, dla którego nie można. */
  removeSignal(index: number): string | null {
    const config = this._draft();
    if (!config) {
      return null;
    }
    const usage = signalUsage(config, index);
    if (usage.length > 0) {
      return `Sygnału używa ${usage.join(', ')}. Zmień to najpierw.`;
    }

    this.edit((draft) => {
      draft.signals.splice(index, 1);
      // Odwołania do sygnałów są przez indeks — przesuń te za usuniętym
      if (draft.selectorSignal !== undefined && draft.selectorSignal > index) {
        draft.selectorSignal--;
      }
      for (const logic of draft.logics) {
        if (logic.inputSignal !== undefined && logic.inputSignal > index) {
          logic.inputSignal--;
        }
      }
    });
    return null;
  }

  /** Nowa logika (index null) albo zmiana istniejącej. */
  setLogic(index: number | null, logic: Logic): void {
    this.edit((config) => {
      if (index === null) {
        config.logics.push(logic);
      } else {
        config.logics[index] = logic;
      }
    });
  }

  /** Usuwa logikę; null albo powód, dla którego nie można. */
  removeLogic(index: number): string | null {
    const config = this._draft();
    if (!config) {
      return null;
    }
    if (config.logics.length <= 1) {
      return 'Sterownik potrzebuje co najmniej jednej logiki.';
    }

    this.edit((draft) => {
      draft.logics.splice(index, 1);
      if (draft.defaultLogicIndex === index) {
        draft.defaultLogicIndex = 0;
      } else if (draft.defaultLogicIndex > index) {
        draft.defaultLogicIndex--;
      }
    });
    return null;
  }

  setSettings(settings: ConfigurationSettings): void {
    this.edit((config) => {
      config.selectorSignal = settings.selectorSignal;
      config.defaultLogicIndex = settings.defaultLogicIndex;
      config.failSafeState = settings.failSafeState;
      config.moveTimeMs = settings.moveTimeMs;
      config.fdcanTermination = settings.fdcanTermination;
    });
  }

  private async setConfiguration(configuration: Configuration): Promise<void> {
    const reply = await this.connection.request(
      Command.SET_CONFIGURATION,
      SetConfigurationRequestSchema,
      { configuration },
      SetConfigurationResponseSchema,
    );
    if (reply.status !== Status.OK) {
      throw new Error(
        `Sterownik odrzucił konfigurację: ${describeConfigurationError(reply.error)}`,
      );
    }
    this._device.set(clone(ConfigurationSchema, configuration));
    this._unsavedOnDevice.set(true);
  }

  private edit(change: (config: Configuration) => void): void {
    const draft = this._draft();
    if (!draft) {
      return;
    }
    const next = clone(ConfigurationSchema, draft);
    change(next);
    this._draft.set(next);
  }

  private async run(busy: ConfigurationBusy, action: () => Promise<void>): Promise<boolean> {
    if (this._busy()) {
      return false;
    }
    this._busy.set(busy);
    this._error.set(null);
    try {
      await action();
      return true;
    } catch (error) {
      this._error.set(describeError(error));
      return false;
    } finally {
      this._busy.set(null);
    }
  }

  private reset(): void {
    this._draft.set(null);
    this._device.set(null);
    this._unsavedOnDevice.set(false);
    this._error.set(null);
  }
}

/** Gdzie konfiguracja używa sygnału (selektor, wejścia logik). */
export function signalUsage(config: Configuration, index: number): string[] {
  const usage: string[] = [];
  if (config.selectorSignal === index) {
    usage.push('selektor logik');
  }
  config.logics.forEach((logic, i) => {
    if (logic.inputSignal === index) {
      usage.push(`logika „${logic.description || i + 1}”`);
    }
  });
  return usage;
}

export function describeConfigurationError(error: ConfigurationError): string {
  return CONFIGURATION_ERRORS[error] ?? `kod błędu ${error}.`;
}

const CONFIGURATION_ERRORS: Partial<Record<ConfigurationError, string>> = {
  [ConfigurationError.TOO_MANY_FRAMES]: `za dużo ramek (max ${MAX_FRAMES}).`,
  [ConfigurationError.INVALID_FRAME_ID]: 'niepoprawne ID ramki.',
  [ConfigurationError.DUPLICATE_FRAME]: 'ta sama ramka jest na liście dwa razy.',
  [ConfigurationError.TOO_MANY_SIGNALS]: `za dużo sygnałów (max ${MAX_SIGNALS}).`,
  [ConfigurationError.INVALID_SIGNAL_FRAME]: 'sygnał odwołuje się do nieistniejącej ramki.',
  [ConfigurationError.INVALID_SIGNAL_LAYOUT]: 'sygnał nie mieści się w 8 bajtach ramki.',
  [ConfigurationError.INVALID_SIGNAL_SCALE]: 'niepoprawna skala albo offset sygnału.',
  [ConfigurationError.NO_LOGIC]: 'brak logiki sterowania.',
  [ConfigurationError.TOO_MANY_LOGICS]: 'za dużo logik.',
  [ConfigurationError.INVALID_SELECTOR_SIGNAL]: 'selektor odwołuje się do nieistniejącego sygnału.',
  [ConfigurationError.SELECTOR_REQUIRED]: 'kilka logik wymaga sygnału selektora.',
  [ConfigurationError.DUPLICATE_SELECTOR_VALUE]: 'dwie logiki mają tę samą wartość selektora.',
  [ConfigurationError.INVALID_DEFAULT_LOGIC]: 'niepoprawna logika domyślna.',
  [ConfigurationError.INVALID_FAIL_SAFE_STATE]: 'niepoprawny stan bezpieczny.',
  [ConfigurationError.INVALID_LOGIC_TYPE]: 'logika bez typu.',
  [ConfigurationError.INVALID_LOGIC_INPUT]: 'logika odwołuje się do nieistniejącego sygnału.',
  [ConfigurationError.INVALID_FIXED_STATE]: 'niepoprawny stan logiki stałej.',
  [ConfigurationError.INVALID_SWITCH_VALUES]:
    'przełącznik ma tę samą wartość otwarcia i zamknięcia.',
  [ConfigurationError.INVALID_HYSTERESIS]: 'próg zamknięcia histerezy jest powyżej progu otwarcia.',
  [ConfigurationError.INVALID_MOVE_TIME]: 'czas ruchu klapy spoza 50–5000 ms.',
};

function describeError(error: unknown): string {
  if (error instanceof ProtocolTimeoutError) {
    return 'Urządzenie nie odpowiada.';
  }
  if (error instanceof ProtocolError) {
    return `Urządzenie zwróciło błąd (${Status[error.status] ?? error.status}).`;
  }
  return error instanceof Error ? error.message : String(error);
}
