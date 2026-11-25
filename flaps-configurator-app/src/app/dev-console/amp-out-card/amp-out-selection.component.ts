import { Component, computed, input, output, signal } from '@angular/core';
import { IonButton } from '@ionic/angular';
import { formatAmpOutMillivolts } from '../../core/amp-out';
import { AmpOutSample, FlapMoveMark } from '../../core/dev-telemetry.service';
import { saveTextFile } from '../../core/save-file';
import { AmpOutRange, ampOutCsv, rangeStats, sampleNotes, samplesInRange } from './amp-out-range';

/** Tyle wierszy pokazujemy w tabeli; eksport zawiera wszystkie. */
const TABLE_LIMIT = 500;

interface Row {
  key: number;
  timeMs: number;
  flap1: number;
  flap2: number;
  note: string;
}

/** Zaznaczony fragment AMP_OUT: podsumowanie, tabela próbek, kopiowanie i zapis CSV. */
@Component({
  selector: 'app-amp-out-selection',
  templateUrl: './amp-out-selection.component.html',
  styleUrls: ['./amp-out-selection.component.scss'],
  imports: [IonButton],
})
export class AmpOutSelectionComponent {
  readonly range = input.required<AmpOutRange>();
  readonly samples = input.required<AmpOutSample[]>();
  readonly marks = input.required<FlapMoveMark[]>();
  readonly cleared = output<void>();

  protected readonly message = signal<{ text: string; error: boolean } | null>(null);
  protected readonly tableLimit = TABLE_LIMIT;

  protected readonly selected = computed(() => samplesInRange(this.samples(), this.range()));
  protected readonly selectedMarks = computed(() => {
    const { fromMs, toMs } = this.range();
    return this.marks().filter((mark) => mark.uptimeMs >= fromMs && mark.uptimeMs <= toMs);
  });
  protected readonly stats = computed(() => rangeStats(this.selected()));

  protected readonly rows = computed<Row[]>(() => {
    const samples = this.selected();
    const start = samples[0]?.uptimeMs ?? 0;
    const notes = sampleNotes(samples, this.selectedMarks());
    return samples.slice(0, TABLE_LIMIT).map((sample, i) => ({
      key: sample.uptimeMs,
      timeMs: sample.uptimeMs - start,
      flap1: sample.flap1,
      flap2: sample.flap2,
      note: (notes.get(i) ?? []).join(', '),
    }));
  });

  protected millivolts(raw: number): string {
    return formatAmpOutMillivolts(raw);
  }

  protected seconds(ms: number): string {
    return `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.csv());
      this.message.set({ text: 'Skopiowano jako tekst (CSV).', error: false });
    } catch {
      this.message.set({ text: 'Nie udało się skopiować do schowka.', error: true });
    }
  }

  protected async save(): Promise<void> {
    try {
      await saveTextFile(this.fileName(), this.csv(), 'text/csv;charset=utf-8');
      this.message.set(null);
    } catch (error) {
      this.message.set({
        text: `Nie udało się zapisać pliku: ${error instanceof Error ? error.message : String(error)}`,
        error: true,
      });
    }
  }

  private csv(): string {
    return ampOutCsv(this.selected(), this.selectedMarks());
  }

  /** np. amp-out_2026-11-18_14-05-12.csv — czas zapisu, bo czas sterownika to uptime. */
  private fileName(): string {
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    return `amp-out_${date}_${time}.csv`;
  }
}
