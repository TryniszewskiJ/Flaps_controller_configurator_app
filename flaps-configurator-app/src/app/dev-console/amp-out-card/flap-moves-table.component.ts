import { Component, inject } from '@angular/core';
import { formatAmpOutMillivolts } from '../../core/amp-out';
import { DevTelemetryService } from '../../core/dev-telemetry.service';
import { FlapPosition, FlapStopReason } from '../../core/protocol/messages';

const STOP_REASONS: Partial<Record<FlapStopReason, string>> = {
  [FlapStopReason.MOVE_TIME]: 'po czasie',
  [FlapStopReason.END_STOP]: 'ogranicznik',
  [FlapStopReason.TIMEOUT]: 'limit czasu',
  [FlapStopReason.INTERRUPTED]: 'przerwany',
};

/**
 * Ruchy klap z EVENT flap_move_finished (zawsze, bez trybu dev): czas, szczyt i prąd na końcu,
 * powód zatrzymania.
 */
@Component({
  selector: 'app-flap-moves-table',
  templateUrl: './flap-moves-table.component.html',
  styleUrls: ['./flap-moves-table.component.scss'],
})
export class FlapMovesTableComponent {
  protected readonly moves = inject(DevTelemetryService).moves;
  protected readonly StopReason = FlapStopReason;

  /** UNSPECIFIED (urządzenie < 1.11) = „—”. */
  protected stopReasonLabel(reason: FlapStopReason): string {
    return STOP_REASONS[reason] ?? '—';
  }

  protected millivolts(raw: number): string {
    return formatAmpOutMillivolts(raw);
  }

  protected direction(position: FlapPosition): string {
    return position === FlapPosition.OPEN
      ? 'otwarcie'
      : position === FlapPosition.CLOSED
        ? 'zamknięcie'
        : '—';
  }
}
