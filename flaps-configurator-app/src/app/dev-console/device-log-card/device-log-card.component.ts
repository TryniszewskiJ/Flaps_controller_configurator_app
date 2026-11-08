import { Component, ElementRef, afterRenderEffect, inject, signal, viewChild } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDown } from 'ionicons/icons';
import { DeviceStateService } from '../../core/device-state.service';
import { LogLevel } from '../../core/protocol/gen/flaps_pb';

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
  imports: [IonButton, IonIcon],
})
export class DeviceLogCardComponent {
  private readonly deviceState = inject(DeviceStateService);

  protected readonly logs = this.deviceState.logs;
  protected readonly dropped = this.deviceState.droppedLogs;
  protected readonly open = signal(true);
  protected readonly LogLevel = LogLevel;

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  constructor() {
    addIcons({ chevronDown });

    // Przewijanie do najnowszej linii
    afterRenderEffect(() => {
      this.logs();
      const el = this.list()?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  protected level(level: LogLevel): string {
    return LEVEL_LABELS[level] ?? '?';
  }

  /** Czas od startu sterownika, np. "12.345 s". */
  protected uptime(ms: number): string {
    return `${(ms / 1000).toFixed(3)} s`;
  }

  protected clear(): void {
    this.deviceState.clearLogs();
  }
}
