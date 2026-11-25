import { AmpOutSample, FlapMoveMark } from '../../core/dev-telemetry.service';
import { FlapPosition } from '../../core/protocol/messages';
import { CHART_MARGIN, buildChart, nearestSample } from './amp-out-chart';

const sample = (uptimeMs: number, flap1: number, flap2 = 0, gap = false): AmpOutSample => ({
  uptimeMs,
  flap1,
  flap2,
  gap,
});

describe('buildChart', () => {
  // Obszar wykresu: 100 px szerokości, 100 px wysokości
  const size = {
    width: 100 + CHART_MARGIN.left + CHART_MARGIN.right,
    height: 100 + CHART_MARGIN.top + CHART_MARGIN.bottom,
  };
  const left = CHART_MARGIN.left;
  const bottom = CHART_MARGIN.top + 100;

  it('draws both flaps over the time window, scaled to the fixed range', () => {
    const chart = buildChart(
      [sample(0, 0, 65535), sample(500, 32768, 0), sample(1000, 65535, 0)],
      [],
      size,
      1000,
      1000,
      3300,
    );

    expect(chart.flap1).toBe(
      `M${left} ${bottom}L${left + 50} ${bottom - 50}L${left + 100} ${bottom - 100}`,
    );
    expect(chart.flap2.startsWith(`M${left} ${bottom - 100}`)).toBe(true);
    expect(chart.yTicks.map((t) => t.label)).toEqual(['0', '1000', '2000', '3000']);
    expect(chart.xTicks.map((t) => t.label)).toEqual([
      '0 s',
      '−0,2 s',
      '−0,4 s',
      '−0,6 s',
      '−0,8 s',
      '−1 s',
    ]);
  });

  it('draws only the scrolled-to window, with time counted from the newest sample', () => {
    const samples = Array.from({ length: 11 }, (_, i) => sample(i * 1000, 1000));
    // Okno 5 s kończy się na 7,3 s, najnowsza próbka ma 10 s
    const chart = buildChart(samples, [], size, 5000, 7300, null, 10_000);

    expect(chart.xTicks.map((t) => t.label)).toEqual(['−3 s', '−4 s', '−5 s', '−6 s', '−7 s']);
    expect(chart.xTicks[0].pos).toBe(left + 94); // 7 s: 4,7 s od lewej krawędzi = 94 px
    // Próbki 2–8 s: te z okna (2,3–7,3 s) i po jednej spoza niego z obu stron
    expect(chart.flap1.match(/[ML]/g)).toHaveLength(7);
  });

  it('starts a new line segment after missing samples', () => {
    const chart = buildChart(
      [sample(0, 1000), sample(20, 1000), sample(200, 1000, 0, true)],
      [],
      size,
      200,
      200,
      null,
    );

    expect(chart.flap1.match(/M/g)).toHaveLength(2);
  });

  it('scales automatically above the peak', () => {
    // 500 mV szczytu -> zapas 15 % -> 600 mV w podziałce 200
    const chart = buildChart([sample(0, 9930)], [], size, 1000, 0, null);

    expect(chart.yMaxMv).toBe(600);
    expect(chart.yTicks.map((t) => t.label)).toEqual(['0', '200', '400', '600']);
  });

  it('zooms in on a signal of a few millivolts', () => {
    // ok. 4 mV w spoczynku (płytka rev1.00) -> skala 0–5 mV
    const chart = buildChart([sample(0, 80)], [], size, 1000, 0, null);

    expect(chart.yMaxMv).toBe(5);
    expect(chart.yTicks.map((t) => t.label)).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('labels fractional millivolt ticks', () => {
    // ok. 1 mV -> zapas 15 % (1,16 mV) -> 0–1,25 mV w podziałce 0,25
    const chart = buildChart([sample(0, 20)], [], size, 1000, 0, null);

    expect(chart.yTicks.map((t) => t.label)).toEqual(['0', '0,25', '0,5', '0,75', '1', '1,25']);
  });

  it('shows move starts inside the window as opening or closing marks', () => {
    const marks: FlapMoveMark[] = [
      { id: 1, uptimeMs: 100, flap: 1, position: FlapPosition.OPENING },
      { id: 2, uptimeMs: 1500, flap: 2, position: FlapPosition.CLOSING },
      { id: 3, uptimeMs: 1900, flap: 2, position: FlapPosition.CLOSING },
    ];
    const chart = buildChart([sample(2000, 0)], marks, size, 1000, 2000, null);

    expect(chart.marks).toEqual([
      { id: 2, x: left + 50, label: 'K2', opening: false },
      { id: 3, x: left + 90, label: 'K2', opening: false },
    ]);
  });
});

describe('nearestSample', () => {
  it('finds the sample closest in time', () => {
    const samples = [sample(0, 1), sample(20, 2), sample(40, 3)];

    expect(nearestSample(samples, 27)?.flap1).toBe(2);
    expect(nearestSample(samples, 33)?.flap1).toBe(3);
    expect(nearestSample(samples, -10)?.flap1).toBe(1);
    expect(nearestSample(samples, 100)?.flap1).toBe(3);
    expect(nearestSample([], 0)).toBeNull();
  });
});
