import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { clone, equals } from '@bufbuild/protobuf';
import { ConnectionService } from '@flaps/core/connection.service';
import { Command, Status } from '@flaps/core/protocol/gen/flaps_common_pb';
import { Logic, LogicSchema } from '@flaps/core/protocol/gen/flaps_logic_pb';
import {
  GetLogicsRequestSchema,
  GetLogicsResponse,
  GetLogicsResponseSchema,
  LogicError,
  SetLogicsRequestSchema,
  SetLogicsResponseSchema,
} from '@flaps/core/protocol/gen/flaps_user_pb';
import { ProtocolError, ProtocolTimeoutError } from '@flaps/core/protocol/protocol-client';
import { DeviceNames } from '@flaps/shared/device-state-format';
import { SignalName } from '@flaps/shared/logic-format';
import { TranslationKey, t } from '@flaps/core/i18n/i18n';

export type LogicsBusy = 'read' | 'apply' | 'save' | null;

/** Edytowane w aplikacji: logiki i która z nich jest domyślna. */
export interface LogicsDraft {
  logics: Logic[];
  defaultLogicIndex: number;
}

/** Zapis do flasha trwa 1–2 s (kasowanie sektora). */
const SAVE_TIMEOUT_MS = 5000;

/**
 * Logiki sterownika dla aplikacji użytkownika: GET_LOGICS / SET_LOGICS (flaps_user.proto).
 * Do aplikacji trafiają tylko logiki, logika domyślna, selektor i nazwy sygnałów — ramki CAN,
 * położenie sygnałów i ustawienia zostają w sterowniku (ustawia je technik).
 */
@Injectable({ providedIn: 'root' })
export class LogicsService {
  private readonly connection = inject(ConnectionService);

  private readonly _device = signal<GetLogicsResponse | null>(null);
  private readonly _draft = signal<LogicsDraft | null>(null);
  private readonly _busy = signal<LogicsBusy>(null);
  private readonly _error = signal<string | null>(null);

  /** Logiki w użyciu na urządzeniu (z nazwami sygnałów). */
  readonly device = this._device.asReadonly();
  /** Wersja robocza edytowana w aplikacji. */
  readonly draft = this._draft.asReadonly();
  readonly busy = this._busy.asReadonly();
  /** Powód ostatniej nieudanej operacji. */
  readonly error = this._error.asReadonly();

  /** Nazwy logik (w użyciu) i sygnałów — do Dashboardu. */
  readonly names = computed<DeviceNames | null>(() => {
    const device = this._device();
    return device
      ? { logics: device.logics.map((logic) => logic.description), signals: device.signalNames }
      : null;
  });
  /** Sygnały dla edytora logik (po indeksie). */
  readonly signals = computed<SignalName[]>(
    () => this._device()?.signalNames.map((name) => ({ name })) ?? [],
  );
  /** Sygnał selektora; brak — sterownik ma jedną logikę. */
  readonly selectorSignal = computed(() => this._device()?.selectorSignal);
  /** Wersja robocza różni się od logik w użyciu na urządzeniu. */
  readonly dirty = computed(() => {
    const draft = this._draft();
    const device = this._device();
    return !!draft && !!device && !sameLogics(draft, device);
  });
  /** Logiki w użyciu nie są zapisane we flashu (znikną po resecie). */
  readonly unsavedOnDevice = computed(() => !!this._device()?.unsavedChanges);

  constructor() {
    effect(() => {
      const status = this.connection.status();
      const bootloader = this.connection.inBootloader();
      untracked(() => {
        if (status === 'disconnected' || (status === 'connected' && bootloader)) {
          // Bootloader (tryb ratunkowy) nie ma logik
          this.reset();
        } else if (status === 'connected' && !this.dirty() && !this._busy()) {
          void this.read();
        }
      });
    });
  }

  /** GET_LOGICS — odrzuca zmiany w wersji roboczej. */
  read(): Promise<boolean> {
    return this.run('read', async () => {
      const reply = await this.connection.request(
        Command.GET_LOGICS,
        GetLogicsRequestSchema,
        {},
        GetLogicsResponseSchema,
      );
      this._device.set(reply);
      this._draft.set(draftOf(reply));
    });
  }

  /** SET_LOGICS — sterownik od razu używa wersji roboczej (do resetu albo zapisu). */
  apply(): Promise<boolean> {
    return this.send('apply', false);
  }

  /** SET_LOGICS z zapisem do flasha — logiki zostają po resecie. */
  save(): Promise<boolean> {
    return this.send('save', true);
  }

  /** Wraca do logik w użyciu na urządzeniu. */
  discard(): void {
    const device = this._device();
    this._draft.set(device ? draftOf(device) : null);
    this._error.set(null);
  }

  /** Nowa logika (index null) albo zmiana istniejącej. */
  setLogic(index: number | null, logic: Logic): void {
    this.edit((draft) => {
      if (index === null) {
        draft.logics.push(logic);
      } else {
        draft.logics[index] = logic;
      }
    });
  }

  /** Usuwa logikę; null albo powód, dla którego nie można. */
  removeLogic(index: number): string | null {
    const draft = this._draft();
    if (!draft) {
      return null;
    }
    if (draft.logics.length <= 1) {
      return t('modes.error.minOne');
    }
    this.edit((next) => {
      next.logics.splice(index, 1);
      if (next.defaultLogicIndex === index) {
        next.defaultLogicIndex = 0;
      } else if (next.defaultLogicIndex > index) {
        next.defaultLogicIndex--;
      }
    });
    return null;
  }

  private send(busy: 'apply' | 'save', save: boolean): Promise<boolean> {
    const draft = this._draft();
    if (!draft) {
      return Promise.resolve(false);
    }
    return this.run(busy, async () => {
      const reply = await this.connection.request(
        Command.SET_LOGICS,
        SetLogicsRequestSchema,
        { logics: draft.logics, defaultLogicIndex: draft.defaultLogicIndex, save },
        SetLogicsResponseSchema,
        save ? { timeoutMs: SAVE_TIMEOUT_MS, retries: 0 } : undefined,
      );
      switch (reply.status) {
        case Status.OK:
          break;
        case Status.INVALID_CONFIGURATION:
          throw new Error(t('modes.error.rejected', { reason: describeLogicError(reply.error) }));
        case Status.FLASH_ERROR:
          throw new Error(t('modes.error.flash'));
        case Status.BUSY:
          throw new Error(t('modes.error.busy'));
        default:
          throw new Error(t('modes.error.rejectedPlain'));
      }
      const device = this._device();
      if (device) {
        const next = clone(GetLogicsResponseSchema, device);
        next.logics = draft.logics.map((logic) => clone(LogicSchema, logic));
        next.defaultLogicIndex = draft.defaultLogicIndex;
        next.unsavedChanges = !save;
        this._device.set(next);
      }
    });
  }

  private edit(change: (draft: LogicsDraft) => void): void {
    const draft = this._draft();
    if (!draft) {
      return;
    }
    const next: LogicsDraft = {
      logics: draft.logics.map((logic) => clone(LogicSchema, logic)),
      defaultLogicIndex: draft.defaultLogicIndex,
    };
    change(next);
    this._draft.set(next);
    this._error.set(null);
  }

  private async run(busy: LogicsBusy, action: () => Promise<void>): Promise<boolean> {
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
    this._device.set(null);
    this._draft.set(null);
    this._error.set(null);
  }
}

function draftOf(device: GetLogicsResponse): LogicsDraft {
  return {
    logics: device.logics.map((logic) => clone(LogicSchema, logic)),
    defaultLogicIndex: device.defaultLogicIndex,
  };
}

function sameLogics(draft: LogicsDraft, device: GetLogicsResponse): boolean {
  return (
    draft.defaultLogicIndex === device.defaultLogicIndex &&
    draft.logics.length === device.logics.length &&
    draft.logics.every((logic, i) => equals(LogicSchema, logic, device.logics[i]))
  );
}

const LOGIC_ERRORS: Partial<Record<LogicError, TranslationKey>> = {
  [LogicError.NO_LOGIC]: 'modes.error.NO_LOGIC',
  [LogicError.TOO_MANY_LOGICS]: 'modes.error.TOO_MANY_LOGICS',
  [LogicError.SELECTOR_REQUIRED]: 'modes.error.SELECTOR_REQUIRED',
  [LogicError.DUPLICATE_SELECTOR_VALUE]: 'modes.error.DUPLICATE_SELECTOR_VALUE',
  [LogicError.INVALID_DEFAULT_LOGIC]: 'modes.error.INVALID_DEFAULT_LOGIC',
  [LogicError.INVALID_LOGIC_TYPE]: 'modes.error.INVALID_LOGIC_TYPE',
  [LogicError.INVALID_LOGIC_INPUT]: 'modes.error.INVALID_LOGIC_INPUT',
  [LogicError.INVALID_FIXED_STATE]: 'modes.error.INVALID_FIXED_STATE',
  [LogicError.INVALID_SWITCH_VALUES]: 'modes.error.INVALID_SWITCH_VALUES',
  [LogicError.INVALID_HYSTERESIS]: 'modes.error.INVALID_HYSTERESIS',
  [LogicError.INVALID_CONDITION]: 'modes.error.INVALID_CONDITION',
};

export function describeLogicError(error: LogicError): string {
  const key = LOGIC_ERRORS[error];
  return key ? t(key) : t('modes.error.code', { code: error });
}

function describeError(error: unknown): string {
  if (error instanceof ProtocolTimeoutError) {
    return t('common.noResponse');
  }
  if (error instanceof ProtocolError) {
    return t('common.deviceError', { status: Status[error.status] ?? error.status });
  }
  return error instanceof Error ? error.message : String(error);
}
