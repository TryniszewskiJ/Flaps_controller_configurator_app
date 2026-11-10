import { Component, computed, inject, signal } from '@angular/core';
import { IonIcon, IonSelect, IonSelectOption, IonToggle } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDown } from 'ionicons/icons';
import { ConfigurationService } from '../../core/configuration.service';
import { DevModeSettings, DeviceStateService } from '../../core/device-state.service';
import { LogLevel } from '../../core/protocol/gen/flaps_pb';

const LOG_LEVELS = [
  { value: LogLevel.OFF, label: 'Wyłączone' },
  { value: LogLevel.ERROR, label: 'Błędy' },
  { value: LogLevel.WARN, label: 'Ostrzeżenia i błędy' },
  { value: LogLevel.INFO, label: 'Info' },
  { value: LogLevel.DEBUG, label: 'Debug (wszystko)' },
];

/** SET_DEV_MODE: logi sterownika i przebieg AMP_OUT po każdym ruchu klapy. */
@Component({
  selector: 'app-dev-mode-card',
  templateUrl: './dev-mode-card.component.html',
  styleUrls: ['./dev-mode-card.component.scss'],
  imports: [IonIcon, IonSelect, IonSelectOption, IonToggle],
})
export class DevModeCardComponent {
  private readonly deviceState = inject(DeviceStateService);
  private readonly configuration = inject(ConfigurationService);

  protected readonly devMode = this.deviceState.devMode;
  protected readonly enabled = this.deviceState.devModeEnabled;
  /** Tryb demo w konfiguracji sterownika — uruchamia się razem z trybem dev. */
  protected readonly demoConfigured = computed(() => !!this.configuration.device()?.demoMode);
  protected readonly levels = LOG_LEVELS;
  protected readonly open = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    addIcons({ chevronDown });
  }

  protected setLogLevel(logLevel: LogLevel | null | undefined): void {
    this.update({ ...this.devMode(), logLevel: logLevel ?? LogLevel.OFF });
  }

  protected setFlapTrace(flapTrace: boolean): void {
    this.update({ ...this.devMode(), flapTrace });
  }

  private update(settings: DevModeSettings): void {
    this.error.set(null);
    this.deviceState.setDevMode(settings).catch((error: unknown) => {
      this.error.set(error instanceof Error ? error.message : String(error));
    });
  }
}
