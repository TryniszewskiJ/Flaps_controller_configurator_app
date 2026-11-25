import { Component, inject, signal } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDown } from 'ionicons/icons';
import { DevTelemetryService } from '../../core/dev-telemetry.service';
import { LogLevel } from '../../core/protocol/messages';
import { StickToBottomDirective } from '../../shared/stick-to-bottom.directive';

const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.OFF]: '',
  [LogLevel.ERROR]: 'ERR',
  [LogLevel.WARN]: 'WRN',
  [LogLevel.INFO]: 'INF',
  [LogLevel.DEBUG]: 'DBG',
};

/** Logi sterownika (LOG, tryb dev): czas od startu, poziom, "tag: wiadomość". */
@Component({
  selector: 'app-device-log-card',
  templateUrl: './device-log-card.component.html',
  styleUrls: ['./device-log-card.component.scss'],
  imports: [IonButton, IonIcon, StickToBottomDirective],
})
export class DeviceLogCardComponent {
  private readonly devTelemetry = inject(DevTelemetryService);

  protected readonly logs = this.devTelemetry.logs;
  protected readonly dropped = this.devTelemetry.droppedLogs;
  protected readonly open = signal(true);
  protected readonly LogLevel = LogLevel;

  constructor() {
    addIcons({ chevronDown });
  }

  protected level(level: LogLevel): string {
    return LEVEL_LABELS[level] ?? '?';
  }

  /** Czas od startu sterownika, np. "12.345 s". */
  protected uptime(ms: number): string {
    return `${(ms / 1000).toFixed(3)} s`;
  }

  protected clear(): void {
    this.devTelemetry.clearLogs();
  }
}
