import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonSelect,
  IonIcon,
  IonSelectOption,
  IonToolbar,
} from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { addIcons } from 'ionicons';
import { informationCircleOutline } from 'ionicons/icons';
import { ConnectionService } from '@flaps/core/connection.service';
import { DeviceStateService, OverrideDuration } from '@flaps/core/device-state.service';
import { FlapsState } from '@flaps/core/protocol/gen/flaps_common_pb';
import { FlapPosition } from '@flaps/core/protocol/gen/flaps_state_pb';
import { ConnectionBannerComponent } from '@flaps/shared/connection-banner/connection-banner.component';
import {
  activeLogicLabel,
  FlapTone,
  flapTone,
  FlapView,
  flapView,
  SignalView,
  signalViews,
} from '@flaps/shared/device-state-format';
import { OVERRIDE_OPTIONS, overrideRemainingLabel } from '@flaps/shared/flaps-override';
import { TranslationKey, t } from '@flaps/core/i18n/i18n';
import { TranslatePipe } from '@flaps/core/i18n/translate.pipe';
import { LogicsService } from '../core/logics.service';
import { CarDataComponent } from '@flaps/shared/car-data/car-data.component';

/** Tryb sterowania klapami: logika (Auto) albo ręcznie otwarte / zamknięte. */
export type FlapsMode = 'auto' | 'open' | 'closed';

/** Wszystkie podłączone klapy razem — duży napis na górze. */
interface FlapsSummary {
  label: string;
  tone: FlapTone;
}

/**
 * Dashboard użytkownika: stan klap, przełącznik Auto / Otwarte / Zamknięte (Auto = steruje
 * logika; ręcznie — na czas albo na stałe, do powrotu na Auto lub resetu sterownika) i sygnały.
 */
@Component({
  selector: 'app-user-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonContent,
    IonSelect,
    IonSelectOption,
    IonIcon,
    ConnectionBannerComponent,
    CarDataComponent,
    TranslatePipe,
  ],
})
export class UserDashboardPage {
  private readonly deviceState = inject(DeviceStateService);
  private readonly logics = inject(LogicsService);

  protected readonly connected = inject(ConnectionService).connected;
  protected readonly state = this.deviceState.state;
  protected readonly override = this.deviceState.override;
  protected readonly overridePermanent = this.deviceState.overridePermanent;
  protected readonly FlapsState = FlapsState;
  /** Na stałe jako pierwsze — główny sposób ręcznego sterowania w tej aplikacji. */
  protected readonly durationOptions = [...OVERRIDE_OPTIONS].reverse();

  protected readonly modes: readonly { value: FlapsMode; label: TranslationKey }[] = [
    { value: 'auto', label: 'dashboard.mode.auto' },
    { value: 'open', label: 'dashboard.mode.open' },
    { value: 'closed', label: 'dashboard.mode.closed' },
  ];

  /** Wyjaśnienie czasu ręcznego sterowania — pod przyciskiem „i”. */
  protected readonly showHint = signal(false);

  /** Tryb, o który poprosił kierowca, zanim sterownik go potwierdził. */
  protected readonly pending = signal<FlapsMode | null>(null);
  protected readonly busy = computed(() => this.pending() !== null);
  protected readonly actionError = signal<string | null>(null);

  /** Bieżący tryb wg sterownika; null bez stanu (brak połączenia). */
  protected readonly mode = computed<FlapsMode | null>(() => {
    if (!this.state()) {
      return null;
    }
    const override = this.override();
    if (override === FlapsState.OPEN) {
      return 'open';
    }
    return override === FlapsState.CLOSED ? 'closed' : 'auto';
  });

  /**
   * Na stałe albo na czas. Sterownik przyjmuje aplikację użytkownika od protokołu 1.15, który zna
   * stałe sterowanie — nie trzeba sprawdzać wersji.
   */
  protected readonly duration = signal<OverrideDuration>('permanent');
  /** Wartość segmentu (ion-segment porównuje wartości jako tekst). */
  protected readonly durationKey = computed(() => String(this.duration()));
  /** Tekst pola — ion-select nie odświeża go sam po zmianie języka. */
  protected readonly durationLabel = computed(
    () => this.durationOptions.find((option) => option.value === this.duration())?.label ?? '',
  );

  /** Odświeżane co sekundę — do odliczania ręcznego sterowania. */
  private readonly now = signal(Date.now());

  protected readonly canControl = computed(
    () => this.connected() && !!this.state() && !this.busy(),
  );

  protected readonly flaps = computed<FlapView[]>(() => {
    const state = this.state();
    return state
      ? [
          flapView(t('flap.name', { n: 1 }), state.flap1),
          flapView(t('flap.name', { n: 2 }), state.flap2),
        ]
      : [];
  });

  protected readonly summary = computed<FlapsSummary | null>(() => {
    const state = this.state();
    if (!state) {
      return null;
    }
    const positions = [state.flap1, state.flap2].filter(
      (position) => position !== FlapPosition.NOT_CONNECTED,
    );
    const tones = new Set(positions.map(flapTone));
    if (tones.has('moving')) {
      return {
        label: positions.some((p) => p === FlapPosition.OPENING)
          ? t('dashboard.summary.opening')
          : t('dashboard.summary.closing'),
        tone: 'moving',
      };
    }
    if (tones.size === 1 && tones.has('open')) {
      return { label: t('dashboard.summary.open'), tone: 'open' };
    }
    if (tones.size === 1 && tones.has('closed')) {
      return { label: t('dashboard.summary.closed'), tone: 'closed' };
    }
    return {
      label: tones.size > 1 ? t('dashboard.summary.mixed') : t('dashboard.summary.unknown'),
      tone: 'unknown',
    };
  });

  /** Klapy w ruchu — na wybranym trybie przełącznika, zanim dojadą. */
  protected readonly movingLabel = computed(() =>
    this.summary()?.tone === 'moving' ? t('dashboard.mode.moving') : null,
  );

  /** Kto steruje klapami: logika (tryb jazdy), kierowca ręcznie, albo stan bezpieczny. */
  protected readonly control = computed(() => {
    const state = this.state();
    if (!state) {
      return null;
    }
    if (this.override() !== null) {
      if (this.overridePermanent()) {
        return t('dashboard.control.permanent');
      }
      const remaining = overrideRemainingLabel(this.deviceState.overrideUntil(), this.now());
      return remaining
        ? t('dashboard.control.timed', { time: remaining })
        : t('dashboard.control.manual');
    }
    const logic = activeLogicLabel(state, this.logics.names()) ?? '';
    return state.activeLogic < 0
      ? t('dashboard.control.noCarData', { name: logic })
      : t('dashboard.control.mode', { name: logic });
  });

  /** Nazwa logiki — steruje na Auto (i przejmie sterowanie po powrocie na Auto). */
  protected readonly activeLogic = computed(() =>
    activeLogicLabel(this.state(), this.logics.names()),
  );

  protected readonly signals = computed<SignalView[]>(() =>
    signalViews(this.state(), this.logics.names()),
  );

  constructor() {
    addIcons({ informationCircleOutline });
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected select(mode: FlapsMode): void {
    if (mode !== this.mode()) {
      vibrate();
      void this.apply(mode);
    }
  }

  /** Zmiana czasu przy sterowaniu ręcznym od razu obowiązuje (np. z „na 5 min” na „na stałe”). */
  protected onDurationChange(key: unknown): void {
    const option = this.durationOptions.find((o) => String(o.value) === String(key));
    if (!option || option.value === this.duration()) {
      return;
    }
    this.duration.set(option.value);
    const mode = this.mode();
    if (mode === 'open' || mode === 'closed') {
      void this.apply(mode);
    }
  }

  private async apply(mode: FlapsMode): Promise<void> {
    this.pending.set(mode);
    this.actionError.set(null);
    try {
      if (mode === 'auto') {
        await this.deviceState.releaseOverride();
      } else {
        const state = mode === 'open' ? FlapsState.OPEN : FlapsState.CLOSED;
        await this.deviceState.setOverride(state, this.duration());
      }
    } catch (error) {
      this.actionError.set(error instanceof Error ? error.message : String(error));
      Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
    } finally {
      this.pending.set(null);
    }
  }
}

/** Krótka wibracja przy przełączeniu (telefon; na komputerze i w przeglądarce nic nie robi). */
function vibrate(): void {
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
}
