import { ampOutMillivolts } from '../../core/amp-out';
import { AmpOutSample, FlapMoveMark } from '../../core/dev-telemetry.service';
import { FlapPosition } from '../../core/protocol/messages';

/** Zaznaczony fragment wykresu (czas sterownika, fromMs ≤ toMs). */
export interface AmpOutRange {
  fromMs: number;
  toMs: number;
}

export interface FlapStats {
  min: number;
  max: number;
  avg: number;
}

export interface RangeStats {
  count: number;
  durationMs: number;
  flap1: FlapStats;
  flap2: FlapStats;
}

/** Próbki z zakresu (dane rosnąco po uptimeMs). */
export function samplesInRange(samples: AmpOutSample[], range: AmpOutRange): AmpOutSample[] {
  const from = lowerBound(samples, range.fromMs);
  const to = lowerBound(samples, range.toMs + 0.5);
  return samples.slice(from, to);
}

/** Min / max / średnia surowego AMP_OUT obu klap; null bez próbek. */
export function rangeStats(samples: AmpOutSample[]): RangeStats | null {
  if (samples.length === 0) {
    return null;
  }
  const stats = (value: (s: AmpOutSample) => number): FlapStats => {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const sample of samples) {
      const v = value(sample);
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
    }
    return { min, max, avg: sum / samples.length };
  };
  return {
    count: samples.length,
    durationMs: samples[samples.length - 1].uptimeMs - samples[0].uptimeMs,
    flap1: stats((s) => s.flap1),
    flap2: stats((s) => s.flap2),
  };
}

export function moveLabel(mark: FlapMoveMark): string {
  return `K${mark.flap} ${mark.position === FlapPosition.OPENING ? 'otwieranie' : 'zamykanie'}`;
}

/**
 * CSV (przecinek, kropka dziesiętna): czas od początku zaznaczenia, czas sterownika,
 * surowe AMP_OUT i mV obu klap; start ruchu przy najbliższej próbce, przerwa w danych
 * w kolumnie "uwagi".
 */
export function ampOutCsv(samples: AmpOutSample[], marks: FlapMoveMark[]): string {
  const notes = sampleNotes(samples, marks);
  const start = samples[0]?.uptimeMs ?? 0;
  const rows = samples.map((s, i) => {
    const note = notes.get(i) ?? [];
    return [
      s.uptimeMs - start,
      s.uptimeMs,
      s.flap1,
      ampOutMillivolts(s.flap1).toFixed(2),
      s.flap2,
      ampOutMillivolts(s.flap2).toFixed(2),
      note.join(' / '),
    ].join(',');
  });
  return ['t_ms,uptime_ms,k1_raw,k1_mv,k2_raw,k2_mv,uwagi', ...rows].join('\n') + '\n';
}

/**
 * Uwagi do próbek (indeks → teksty): przerwa w danych przed próbką i start ruchu
 * przy najbliższej próbce.
 */
export function sampleNotes(samples: AmpOutSample[], marks: FlapMoveMark[]): Map<number, string[]> {
  const notes = new Map<number, string[]>();
  const add = (index: number, text: string): void => {
    notes.set(index, [...(notes.get(index) ?? []), text]);
  };
  samples.forEach((sample, i) => {
    if (sample.gap && i > 0) {
      add(i, 'przerwa w danych');
    }
  });
  for (const mark of marks) {
    const index = nearestIndex(samples, mark.uptimeMs);
    if (index >= 0) {
      add(index, moveLabel(mark));
    }
  }
  return notes;
}

function nearestIndex(samples: AmpOutSample[], t: number): number {
  if (samples.length === 0) {
    return -1;
  }
  const i = lowerBound(samples, t);
  if (i === 0) {
    return 0;
  }
  if (i >= samples.length) {
    return samples.length - 1;
  }
  return t - samples[i - 1].uptimeMs <= samples[i].uptimeMs - t ? i - 1 : i;
}

function lowerBound(samples: AmpOutSample[], t: number): number {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].uptimeMs < t) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}
