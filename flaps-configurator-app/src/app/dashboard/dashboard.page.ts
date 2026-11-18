import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, checkmark, createOutline } from 'ionicons/icons';
import { ConfigurationService } from '../core/configuration.service';
import { ConnectionService } from '../core/connection.service';
import { DeviceStateService } from '../core/device-state.service';
import { FlapPosition, FlapsState } from '../core/protocol/gen/flaps_pb';
import { AmpOutCardComponent } from '../dev-console/amp-out-card/amp-out-card.component';
import { CommandCardComponent } from '../dev-console/command-card/command-card.component';
import { DeviceLogCardComponent } from '../dev-console/device-log-card/device-log-card.component';
import { FrameLogCardComponent } from '../dev-console/frame-log-card/frame-log-card.component';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';
import { DashboardLayoutService, widgetTitle } from './dashboard-layout.service';
import { WidgetFrameComponent } from './widget-frame/widget-frame.component';
import { ThemeToggleComponent } from '../shared/theme-toggle/theme-toggle.component';

interface FlapView {
  name: string;
  label: string;
  tone: 'open' | 'closed' | 'moving' | 'unknown' | 'off';
}

interface SignalView {
  index: number;
  name: string;
  value: string;
  fresh: boolean;
}

const FLAP_LABELS: Record<FlapPosition, string> = {
  [FlapPosition.UNSPECIFIED]: '—',
  [FlapPosition.UNKNOWN]: 'Nieznana (bez ruchu od startu)',
  [FlapPosition.OPENING]: 'Otwieranie…',
  [FlapPosition.OPEN]: 'Otwarta',
  [FlapPosition.CLOSING]: 'Zamykanie…',
  [FlapPosition.CLOSED]: 'Zamknięta',
  [FlapPosition.NOT_CONNECTED]: 'Niepodłączona',
};

/** Czas ręcznego sterowania do wyboru (firmware przyjmuje do 10 min). */
const OVERRIDE_MINUTES = [1, 5, 10];

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  imports: [
    ThemeToggleComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSelect,
    IonSelectOption,
    ConnectionBannerComponent,
    WidgetFrameComponent,
    CommandCardComponent,
    AmpOutCardComponent,
    DeviceLogCardComponent,
    FrameLogCardComponent,
  ],
})
export class DashboardPage {
  private readonly deviceState = inject(DeviceStateService);
  private readonly configuration = inject(ConfigurationService);
  private readonly actionSheet = inject(ActionSheetController);
  protected readonly layout = inject(DashboardLayoutService);

  /** Sekcje na Dashboard (kolejność z układu) i te, które można dodać przyciskiem +. */
  protected readonly widgets = this.layout.widgets;
  protected readonly available = this.layout.available;
  protected readonly widgetTitle = widgetTitle;
  /** Tryb edycji: przy każdej sekcji przesuwanie i usuwanie. */
  protected readonly editing = signal(false);

  protected readonly connected = inject(ConnectionService).connected;
  protected readonly state = this.deviceState.state;
  protected readonly override = this.deviceState.override;
  protected readonly FlapsState = FlapsState;
  protected readonly overrideMinutesOptions = OVERRIDE_MINUTES;

  protected readonly overrideMinutes = signal(5);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  /** Odświeżane co sekundę — do odliczania ręcznego sterowania. */
  private readonly now = signal(Date.now());

  /** Aktywna logika (tryb jazdy) z nazwą z konfiguracji; -1 = stan bezpieczny. */
  protected readonly activeLogic = computed(() => {
    const state = this.state();
    if (!state) {
      return null;
    }
    if (state.activeLogic < 0) {
      return 'Stan bezpieczny';
    }
    const logic = this.configuration.device()?.logics[state.activeLogic];
    return logic?.description || `Logika ${state.activeLogic + 1}`;
  });

  protected readonly flaps = computed<FlapView[]>(() => {
    const state = this.state();
    return state ? [flapView('Klapa 1', state.flap1), flapView('Klapa 2', state.flap2)] : [];
  });

  protected readonly signals = computed<SignalView[]>(() => {
    const names = this.configuration.device()?.signals ?? [];
    return [...(this.state()?.signals ?? [])]
      .sort((a, b) => a.index - b.index)
      .map((s) => ({
        index: s.index,
        name: names[s.index]?.name || `Sygnał ${s.index + 1}`,
        value: formatValue(s.value),
        fresh: s.fresh,
      }));
  });

  /** Tryb demo: sterownik odtwarza przejazd zamiast CAN auta (demo i tryb dev w konfiguracji). */
  protected readonly demo = computed(() => {
    const config = this.configuration.device();
    return !!config?.demoMode && !!config.devMode;
  });

  /** Klapy otwarte albo w trakcie otwierania — przycisk je zamyka. */
  protected readonly flapsOpen = computed(() => {
    const state = this.state();
    return !!state && [state.flap1, state.flap2].some(isOpening);
  });

  /** Pozostały czas ręcznego sterowania, np. "4:32". */
  protected readonly overrideRemaining = computed(() => {
    const until = this.deviceState.overrideUntil();
    if (until === null) {
      return null;
    }
    const seconds = Math.max(0, Math.ceil((until - this.now()) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    addIcons({ add, checkmark, createOutline });
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Lista sekcji spoza Dashboardu (także z Dev console); wybrana trafia na dół. */
  protected async addWidget(): Promise<void> {
    const sheet = await this.actionSheet.create({
      header: 'Dodaj sekcję',
      buttons: [
        ...this.available().map((widget) => ({
          text: widget.source === 'Dashboard' ? widget.title : `${widget.title} · Dev console`,
          handler: (): void => this.layout.add(widget.id),
        })),
        { text: 'Anuluj', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  /** Otwiera albo zamyka klapy na wybrany czas zamiast logiki. */
  protected toggleFlaps(): void {
    const target = this.flapsOpen() ? FlapsState.CLOSED : FlapsState.OPEN;
    void this.run(() => this.deviceState.setOverride(target, this.overrideMinutes() * 60_000));
  }

  protected releaseOverride(): void {
    void this.run(() => this.deviceState.releaseOverride());
  }

  protected onMinutesChange(value: number | null | undefined): void {
    this.overrideMinutes.set(value ?? 5);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch (error) {
      this.actionError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }
}

function isOpening(position: FlapPosition): boolean {
  return position === FlapPosition.OPEN || position === FlapPosition.OPENING;
}

function flapView(name: string, position: FlapPosition): FlapView {
  const tone =
    position === FlapPosition.OPEN
      ? 'open'
      : position === FlapPosition.CLOSED
        ? 'closed'
        : position === FlapPosition.OPENING || position === FlapPosition.CLOSING
          ? 'moving'
          : position === FlapPosition.NOT_CONNECTED
            ? 'off'
            : 'unknown';
  return { name, label: FLAP_LABELS[position] ?? '—', tone };
}

/** Wartość sygnału: całkowite bez części ułamkowej, reszta do 3 miejsc. */
function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}
