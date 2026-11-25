import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { formatAmpOutMillivolts } from '../../core/amp-out';
import {
  ConfigurationSettings,
  END_STOP_BLANKING_MS,
  END_STOP_THRESHOLD,
  END_STOP_TIMEOUT_MS,
  FlapOutputSettings,
  MAX_MOVE_TIME_MS,
  MIN_MOVE_TIME_MS,
} from '../../core/configuration.service';
import { FlapsState, FlapStopMode, Logic, LogLevel, Signal } from '../../core/protocol/messages';
import { LOG_LEVELS, parseInteger } from '../config-format';

/** Wartość pola selektora „brak” — ion-select nie rozróżnia undefined. */
const NO_SELECTOR = -1;

/**
 * Okno ustawień ogólnych: selektor, logika domyślna, stan bezpieczny, koniec ruchu (po czasie albo
 * na ograniczniku), wyjścia klap, terminator i tryb deweloperski (logi, AMP_OUT, demo).
 * Zamyka się z ustawieniami (rola 'save') albo 'cancel'.
 */
@Component({
  selector: 'app-settings-editor',
  templateUrl: './settings-editor.component.html',
  styleUrls: ['./settings-editor.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonInput,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonToggle,
  ],
})
export class SettingsEditorComponent implements OnInit {
  private readonly modal = inject(ModalController);

  // componentProps z ModalController (przypisywane przed ngOnInit)
  signals: Signal[] = [];
  logics: Logic[] = [];
  settings?: ConfigurationSettings;

  protected readonly selector = signal(NO_SELECTOR);
  protected readonly defaultLogic = signal(0);
  protected readonly failSafeState = signal(FlapsState.CLOSED);
  protected readonly stopMode = signal(FlapStopMode.TIME);
  protected readonly moveTimeText = signal('250');
  protected readonly thresholdText = signal(String(END_STOP_THRESHOLD.default));
  protected readonly blankingText = signal(String(END_STOP_BLANKING_MS.default));
  protected readonly timeoutText = signal(String(END_STOP_TIMEOUT_MS.default));
  protected readonly termination = signal(false);
  protected readonly flap1 = signal<FlapOutputSettings>({ connected: true, reversed: false });
  protected readonly flap2 = signal<FlapOutputSettings>({ connected: true, reversed: false });
  protected readonly devMode = signal(false);
  protected readonly logLevel = signal(LogLevel.INFO);
  protected readonly readAmpOut = signal(false);
  protected readonly demoMode = signal(false);
  protected readonly moveTime = computed(() => parseInteger(this.moveTimeText()));
  protected readonly threshold = computed(() => parseInteger(this.thresholdText()));
  protected readonly blanking = computed(() => parseInteger(this.blankingText()));
  protected readonly timeout = computed(() => parseInteger(this.timeoutText()));
  protected readonly endStopMode = computed(() => this.stopMode() === FlapStopMode.END_STOP);

  protected readonly NO_SELECTOR = NO_SELECTOR;
  protected readonly flapNumbers = [1, 2] as const;
  protected readonly FlapsState = FlapsState;
  protected readonly logLevels = LOG_LEVELS;
  protected readonly MIN_MOVE_TIME_MS = MIN_MOVE_TIME_MS;
  protected readonly MAX_MOVE_TIME_MS = MAX_MOVE_TIME_MS;
  protected readonly END_STOP_THRESHOLD = END_STOP_THRESHOLD;
  protected readonly END_STOP_BLANKING_MS = END_STOP_BLANKING_MS;
  protected readonly END_STOP_TIMEOUT_MS = END_STOP_TIMEOUT_MS;

  protected readonly selectorError = computed(() => {
    if (this.selector() === NO_SELECTOR) {
      return this.logics.length > 1
        ? 'Kilka logik wymaga selektora — bez niego może być tylko jedna.'
        : null;
    }
    const seen = new Map<number, number>();
    for (const [i, logic] of this.logics.entries()) {
      const other = seen.get(logic.selectorValue);
      if (other !== undefined) {
        return `Logiki ${logicName(this.logics, other)} i ${logicName(this.logics, i)} mają tę samą wartość selektora (${logic.selectorValue}).`;
      }
      seen.set(logic.selectorValue, i);
    }
    return null;
  });

  protected readonly moveTimeError = computed(() =>
    rangeError(this.moveTime(), { min: MIN_MOVE_TIME_MS, max: MAX_MOVE_TIME_MS }, ' ms'),
  );

  protected readonly thresholdError = computed(() =>
    rangeError(this.threshold(), END_STOP_THRESHOLD, ''),
  );

  protected readonly blankingError = computed(() =>
    rangeError(this.blanking(), END_STOP_BLANKING_MS, ' ms'),
  );

  protected readonly timeoutError = computed(() => {
    const range = rangeError(this.timeout(), END_STOP_TIMEOUT_MS, ' ms');
    if (range) {
      return range;
    }
    return !this.blankingError() && this.timeout() <= this.blanking()
      ? 'Limit czasu musi być dłuższy niż wygaszenie.'
      : null;
  });

  private readonly endStopValid = computed(
    () => !this.thresholdError() && !this.blankingError() && !this.timeoutError(),
  );

  /** Próg w mV — wykres AMP_OUT w Dev console jest w mV. */
  protected readonly thresholdMillivolts = computed(() =>
    this.thresholdError() ? null : formatAmpOutMillivolts(this.threshold()),
  );

  protected readonly flapsError = computed(() =>
    !this.flap1().connected && !this.flap2().connected
      ? 'Co najmniej jedna klapa musi być podłączona.'
      : null,
  );

  protected readonly valid = computed(
    // Liczą się pola widoczne w wybranym trybie końca ruchu
    () =>
      !this.selectorError() &&
      !this.flapsError() &&
      (this.endStopMode() ? this.endStopValid() : !this.moveTimeError()),
  );

  protected readonly logicName = (index: number): string => logicName(this.logics, index);

  constructor() {
    addIcons({ close });
  }

  ngOnInit(): void {
    const settings = this.settings;
    if (settings) {
      this.selector.set(settings.selectorSignal ?? NO_SELECTOR);
      this.defaultLogic.set(settings.defaultLogicIndex);
      this.failSafeState.set(
        settings.failSafeState === FlapsState.OPEN ? FlapsState.OPEN : FlapsState.CLOSED,
      );
      this.stopMode.set(settings.stopMode);
      this.moveTimeText.set(String(settings.moveTimeMs));
      this.thresholdText.set(String(settings.endStop.threshold));
      this.blankingText.set(String(settings.endStop.blankingMs));
      this.timeoutText.set(String(settings.endStop.timeoutMs));
      this.termination.set(settings.fdcanTermination);
      this.flap1.set({ ...settings.flap1 });
      this.flap2.set({ ...settings.flap2 });
      this.devMode.set(settings.devMode);
      this.logLevel.set(settings.logLevel);
      this.readAmpOut.set(settings.readAmpOut);
      this.demoMode.set(settings.demoMode);
    }
  }

  protected onSelector(value: unknown): void {
    this.selector.set(typeof value === 'number' ? value : NO_SELECTOR);
  }

  protected onDefaultLogic(value: unknown): void {
    this.defaultLogic.set(Number(value));
  }

  protected onFailSafe(value: unknown): void {
    this.failSafeState.set(value === 'open' ? FlapsState.OPEN : FlapsState.CLOSED);
  }

  protected onLogLevel(value: unknown): void {
    this.logLevel.set(typeof value === 'number' ? value : LogLevel.OFF);
  }

  protected onStopMode(value: unknown): void {
    this.stopMode.set(value === 'end-stop' ? FlapStopMode.END_STOP : FlapStopMode.TIME);
  }

  protected onMoveTime(value: unknown): void {
    this.moveTimeText.set(typeof value === 'string' ? value : '');
  }

  protected onThreshold(value: unknown): void {
    this.thresholdText.set(typeof value === 'string' ? value : '');
  }

  protected onBlanking(value: unknown): void {
    this.blankingText.set(typeof value === 'string' ? value : '');
  }

  protected onTimeout(value: unknown): void {
    this.timeoutText.set(typeof value === 'string' ? value : '');
  }

  protected flapOutput(flap: 1 | 2): FlapOutputSettings {
    return flap === 1 ? this.flap1() : this.flap2();
  }

  protected setFlapOutput(flap: 1 | 2, change: Partial<FlapOutputSettings>): void {
    (flap === 1 ? this.flap1 : this.flap2).update((output) => ({ ...output, ...change }));
  }

  protected async save(): Promise<void> {
    if (!this.valid()) {
      return;
    }
    // Ukryte pole drugiego trybu z błędem zostaje takie jak przed edycją
    const previous = this.settings;
    const settings: ConfigurationSettings = {
      selectorSignal: this.selector() === NO_SELECTOR ? undefined : this.selector(),
      defaultLogicIndex: this.defaultLogic(),
      failSafeState: this.failSafeState(),
      stopMode: this.stopMode(),
      moveTimeMs: this.moveTimeError() && previous ? previous.moveTimeMs : this.moveTime(),
      endStop:
        !this.endStopValid() && previous
          ? previous.endStop
          : { threshold: this.threshold(), blankingMs: this.blanking(), timeoutMs: this.timeout() },
      fdcanTermination: this.termination(),
      flap1: this.flap1(),
      flap2: this.flap2(),
      devMode: this.devMode(),
      logLevel: this.logLevel(),
      readAmpOut: this.readAmpOut(),
      demoMode: this.demoMode(),
    };
    await this.modal.dismiss(settings, 'save');
  }

  protected async close(): Promise<void> {
    await this.modal.dismiss(null, 'cancel');
  }
}

/** Liczba całkowita w zakresie albo komunikat błędu. */
function rangeError(
  value: number,
  limits: { min: number; max: number },
  unit: string,
): string | null {
  return Number.isNaN(value) || value < limits.min || value > limits.max
    ? `Podaj wartość od ${limits.min} do ${limits.max}${unit}.`
    : null;
}

function logicName(logics: Logic[], index: number): string {
  return `„${logics[index]?.description || index + 1}”`;
}
