import { Component, computed, input, output } from '@angular/core';
import { FRAME_BYTES } from '../../core/can/signal-layout';

/** Inny sygnał tej samej ramki — pokazany w tle, żeby było widać wolne bity. */
export interface OccupiedBits {
  name: string;
  bits: number[];
}

interface BitCell {
  bit: number;
  selected: boolean;
  msb: boolean;
  lsb: boolean;
  anchor: boolean;
  /** Nazwy innych sygnałów na tym bicie. */
  others: string[];
}

const BIT_COLUMNS = [7, 6, 5, 4, 3, 2, 1, 0];

/**
 * Siatka 8 × 8 bitów ramki CAN jak w SavvyCAN: wiersz = bajt, kolumny od bitu 7 do 0,
 * w komórce numer bitu w numeracji DBC. Dotknięcie komórki zgłasza bitTap.
 */
@Component({
  selector: 'app-bit-grid',
  templateUrl: './bit-grid.component.html',
  styleUrls: ['./bit-grid.component.scss'],
})
export class BitGridComponent {
  /** Bity zaznaczonego sygnału od MSB do LSB. */
  readonly bits = input<number[]>([]);
  readonly others = input<OccupiedBits[]>([]);
  /** Pierwszy dotknięty bit, gdy zaznaczanie zakresu jest w toku. */
  readonly anchor = input<number | null>(null);
  readonly bitTap = output<number>();

  protected readonly columns = BIT_COLUMNS;

  protected readonly rows = computed<BitCell[][]>(() => {
    const bits = this.bits();
    const selected = new Set(bits);
    const msb = bits[0];
    const lsb = bits.at(-1);
    const anchor = this.anchor();
    const others = this.others();

    return Array.from({ length: FRAME_BYTES }, (_, byte) =>
      BIT_COLUMNS.map((column) => {
        const bit = byte * 8 + column;
        return {
          bit,
          selected: selected.has(bit),
          msb: bits.length > 1 && bit === msb,
          lsb: bits.length > 1 && bit === lsb,
          anchor: bit === anchor,
          others: others.filter((other) => other.bits.includes(bit)).map((other) => other.name),
        };
      }),
    );
  });

  protected label(cell: BitCell): string {
    const parts = [`Bit ${cell.bit}`];
    if (cell.selected) {
      parts.push('zaznaczony');
    }
    if (cell.others.length > 0) {
      parts.push(`zajęty przez ${cell.others.join(', ')}`);
    }
    return parts.join(', ');
  }
}
