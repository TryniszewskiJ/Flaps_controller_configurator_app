import { ampOutMillivolts } from '../../core/amp-out';
import { AmpOutSample, FlapMoveMark } from '../../core/device-state.service';
import { FlapPosition } from '../../core/protocol/gen/flaps_pb';

/** Marginesy obszaru wykresu w px (miejsce na osie i etykiety znaczników). */
export const CHART_MARGIN = { top: 30, right: 10, bottom: 22, left: 44 };

export interface ChartSize {
  width: number;
  height: number;
}

export interface ChartTick {
  pos: number;
  label: string;
}

export interface ChartMark {
  id: number;
  x: number;
  label: string;
  opening: boolean;
}

export interface ChartModel {
  /** Ścieżki SVG obu klap; przerwa w danych = nowy odcinek (M). */
  flap1: string;
  flap2: string;
  xTicks: ChartTick[];
  yTicks: ChartTick[];
  marks: ChartMark[];
  /** Czas (uptime sterownika) prawej krawędzi i szerokość okna. */
  endMs: number;
  windowMs: number;
  yMaxMv: number;
}

// Podziałki osi Y w mV — od ułamków mV (sygnał bliski zera) do pełnych 3300 mV
const Y_STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const MAX_Y_TICKS = 5;

/**
 * Wykres AMP_OUT (napięcie w mV) w oknie `windowMs` kończącym się na `endMs`; `yMaxMv`
 * null = auto. Oś czasu liczona od `zeroMs` (najnowsza próbka), także po przewinięciu.
 */
export function buildChart(
  samples: AmpOutSample[],
  marks: FlapMoveMark[],
  size: ChartSize,
  windowMs: number,
  endMs: number,
  yMaxMv: number | null,
  zeroMs = endMs,
): ChartModel {
  const plotWidth = Math.max(1, size.width - CHART_MARGIN.left - CHART_MARGIN.right);
  const plotHeight = Math.max(1, size.height - CHART_MARGIN.top - CHART_MARGIN.bottom);
  const startMs = endMs - windowMs;

  // Po jednej próbce spoza okna z obu stron, żeby linia dochodziła do krawędzi
  const from = Math.max(0, firstIndexAtOrAfter(samples, startMs) - 1);
  const to = Math.min(samples.length, firstIndexAtOrAfter(samples, endMs) + 1);
  const visible = samples.slice(from, to);

  const peak = visible.reduce((max, s) => Math.max(max, s.flap1, s.flap2), 0);
  const { max, step } = yMaxMv === null ? niceScale(ampOutMillivolts(peak)) : fixedScale(yMaxMv);

  const x = (t: number): number => CHART_MARGIN.left + ((t - startMs) / windowMs) * plotWidth;
  const y = (raw: number): number =>
    CHART_MARGIN.top + plotHeight - (Math.min(ampOutMillivolts(raw), max) / max) * plotHeight;

  const path = (value: (s: AmpOutSample) => number): string =>
    visible
      .map((s, i) => `${i === 0 || s.gap ? 'M' : 'L'}${round(x(s.uptimeMs))} ${round(y(value(s)))}`)
      .join('');

  // Podziałki co 1/5 okna, w równych odstępach od zera (najnowszej próbki)
  const xStep = windowMs / 5;
  const xTicks: ChartTick[] = [];
  const lastTick = zeroMs - Math.ceil((zeroMs - endMs) / xStep - 1e-6) * xStep;
  for (let t = lastTick; t >= startMs - 1; t -= xStep) {
    xTicks.push({ pos: round(x(t)), label: secondsLabel(t - zeroMs) });
  }

  const yTicks: ChartTick[] = [];
  for (let v = 0; v <= max + step / 1000; v += step) {
    yTicks.push({
      pos: round(CHART_MARGIN.top + plotHeight - (v / max) * plotHeight),
      label: millivoltsLabel(v, step),
    });
  }

  return {
    flap1: path((s) => s.flap1),
    flap2: path((s) => s.flap2),
    xTicks,
    yTicks,
    marks: marks
      .filter((mark) => mark.uptimeMs >= startMs && mark.uptimeMs <= endMs)
      .map((mark) => ({
        id: mark.id,
        x: round(x(mark.uptimeMs)),
        label: `K${mark.flap}`,
        opening: mark.position === FlapPosition.OPENING,
      })),
    endMs,
    windowMs,
    yMaxMv: max,
  };
}

/** Próbka najbliższa czasowi `t` (dane rosnąco po uptimeMs). */
export function nearestSample(samples: AmpOutSample[], t: number): AmpOutSample | null {
  if (samples.length === 0) {
    return null;
  }
  const i = firstIndexAtOrAfter(samples, t);
  const after = samples[Math.min(i, samples.length - 1)];
  const before = samples[Math.max(0, i - 1)];
  return Math.abs(before.uptimeMs - t) <= Math.abs(after.uptimeMs - t) ? before : after;
}

function firstIndexAtOrAfter(samples: AmpOutSample[], t: number): number {
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

/** Zakres osi Y z zapasem nad szczytem, najwyżej MAX_Y_TICKS podziałek. */
function niceScale(peakMv: number): { max: number; step: number } {
  const target = Math.max(peakMv * 1.15, 1);
  const step = Y_STEPS.find((s) => Math.ceil(target / s) <= MAX_Y_TICKS) ?? 1000;
  return { max: Math.ceil(target / step) * step, step };
}

function fixedScale(maxMv: number): { max: number; step: number } {
  const step = Y_STEPS.find((s) => Math.ceil(maxMv / s) <= MAX_Y_TICKS) ?? 1000;
  return { max: maxMv, step };
}

function secondsLabel(ms: number): string {
  const seconds = ms / 1000;
  const text = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
  return `${text.replace('-', '−').replace('.', ',')} s`;
}

function millivoltsLabel(mv: number, step: number): string {
  const decimals = Number.isInteger(step) ? 0 : step < 0.25 ? 1 : 2;
  return mv
    .toFixed(decimals)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
    .replace('.', ',');
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
