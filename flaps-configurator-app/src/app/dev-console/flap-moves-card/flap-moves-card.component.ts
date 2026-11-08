import { Component, inject, signal } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDown } from 'ionicons/icons';
import { AMP_OUT_VREF_VOLTS, formatAmpOutVolts } from '../../core/amp-out';
import { DeviceStateService, FlapMove } from '../../core/device-state.service';
import { FlapPosition } from '../../core/protocol/gen/flaps_pb';

interface TraceRow {
  timeMs: number;
  raw: number;
  volts: string;
  peak: boolean;
}

/**
 * Ruchy klap: czas, szczyt prądu i prąd przy zatrzymaniu (EVENT flap_move_finished, zawsze)
 * oraz przebieg AMP_OUT z FLAP_TRACE (tryb dev) w tabeli — do strojenia progu ogranicznika.
 */
@Component({
  selector: 'app-flap-moves-card',
  templateUrl: './flap-moves-card.component.html',
  styleUrls: ['./flap-moves-card.component.scss'],
  imports: [IonButton, IonIcon],
})
export class FlapMovesCardComponent {
  private readonly deviceState = inject(DeviceStateService);

  protected readonly moves = this.deviceState.moves;
  protected readonly open = signal(true);
  /** Ruch z rozwiniętym przebiegiem. */
  protected readonly expanded = signal<number | null>(null);
  protected readonly vref = AMP_OUT_VREF_VOLTS.toFixed(1).replace('.', ',');

  constructor() {
    addIcons({ chevronDown });
  }

  protected toggle(move: FlapMove): void {
    this.expanded.set(this.expanded() === move.id ? null : move.id);
  }

  protected clear(): void {
    this.expanded.set(null);
    this.deviceState.clearMoves();
  }

  protected direction(position: FlapPosition): string {
    return position === FlapPosition.OPEN
      ? 'otwarcie'
      : position === FlapPosition.CLOSED
        ? 'zamknięcie'
        : '—';
  }

  protected volts(raw: number | null): string {
    return raw === null ? '' : formatAmpOutVolts(raw);
  }

  protected traceRows(move: FlapMove): TraceRow[] {
    const trace = move.trace;
    if (!trace) {
      return [];
    }
    const max = Math.max(...trace.samples);
    return trace.samples.map((raw, i) => ({
      timeMs: i * trace.intervalMs,
      raw,
      volts: formatAmpOutVolts(raw),
      peak: raw === max,
    }));
  }
}
