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
import { DeviceStateService, OverrideDuration } from '../core/device-state.service';
import { FlapsState } from '../core/protocol/messages';
import { AmpOutCardComponent } from '../dev-console/amp-out-card/amp-out-card.component';
import { CommandCardComponent } from '../dev-console/command-card/command-card.component';
import { DeviceLogCardComponent } from '../dev-console/device-log-card/device-log-card.component';
import { FrameLogCardComponent } from '../dev-console/frame-log-card/frame-log-card.component';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';
import { CarDataComponent } from '../shared/car-data/car-data.component';
import { DashboardLayoutService, widgetTitle } from './dashboard-layout.service';
import { WidgetFrameComponent } from './widget-frame/widget-frame.component';
import { OVERRIDE_OPTIONS, overrideRemainingLabel } from '../shared/flaps-override';
import {
  activeLogicLabel,
  DeviceNames,
  FlapView,
  flapView,
  isOpening,
  signalViews,
  SignalView,
} from '../shared/device-state-format';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSelect,
    IonSelectOption,
    ConnectionBannerComponent,
    CarDataComponent,
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
  protected readonly overridePermanent = this.deviceState.overridePermanent;
  protected readonly permanentSupported = this.deviceState.permanentOverrideSupported;
  protected readonly FlapsState = FlapsState;
  protected readonly overrideOptions = OVERRIDE_OPTIONS;

  protected readonly overrideDuration = signal<OverrideDuration>(5 * 60_000);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  /** Odświeżane co sekundę — do odliczania ręcznego sterowania. */
  private readonly now = signal(Date.now());

  /** Aktywna logika (tryb jazdy) z nazwą z konfiguracji; -1 = stan bezpieczny. */
  /** Nazwy logik i sygnałów z konfiguracji urządzenia. */
  private readonly names = computed<DeviceNames | null>(() => {
    const config = this.configuration.device();
    return config
      ? {
          logics: config.logics.map((logic) => logic.description),
          signals: config.signals.map((signal) => signal.name),
        }
      : null;
  });

  protected readonly activeLogic = computed(() => activeLogicLabel(this.state(), this.names()));

  protected readonly flaps = computed<FlapView[]>(() => {
    const state = this.state();
    return state ? [flapView('Klapa 1', state.flap1), flapView('Klapa 2', state.flap2)] : [];
  });

  protected readonly signals = computed<SignalView[]>(() =>
    signalViews(this.state(), this.names()),
  );

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
  protected readonly overrideRemaining = computed(() =>
    overrideRemainingLabel(this.deviceState.overrideUntil(), this.now()),
  );

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
    void this.run(() => this.deviceState.setOverride(target, this.overrideDuration()));
  }

  protected releaseOverride(): void {
    void this.run(() => this.deviceState.releaseOverride());
  }

  protected onDurationChange(value: OverrideDuration | null | undefined): void {
    this.overrideDuration.set(value ?? 5 * 60_000);
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
