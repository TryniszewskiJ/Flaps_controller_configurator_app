import { AmpOutSample, FlapMoveMark } from '../../core/device-state.service';
import { FlapPosition } from '../../core/protocol/gen/flaps_pb';
import { ampOutCsv, rangeStats, samplesInRange } from './amp-out-range';

const sample = (uptimeMs: number, flap1: number, flap2: number, gap = false): AmpOutSample => ({
  uptimeMs,
  flap1,
  flap2,
  gap,
});

describe('AMP_OUT range', () => {
  const samples = [
    sample(1000, 100, 0),
    sample(1020, 200, 65535),
    sample(1040, 300, 0),
    sample(1100, 400, 0, true),
  ];

  it('takes the samples inside the range, both ends included', () => {
    expect(samplesInRange(samples, { fromMs: 1020, toMs: 1100 }).map((s) => s.uptimeMs)).toEqual([
      1020, 1040, 1100,
    ]);
    expect(samplesInRange(samples, { fromMs: 1041, toMs: 1099 })).toEqual([]);
  });

  it('computes min, max and average of both flaps', () => {
    expect(rangeStats(samples)).toEqual({
      count: 4,
      durationMs: 100,
      flap1: { min: 100, max: 400, avg: 250 },
      flap2: { min: 0, max: 65535, avg: 65535 / 4 },
    });
    expect(rangeStats([])).toBeNull();
  });

  it('exports CSV with millivolts, gaps and move starts', () => {
    const marks: FlapMoveMark[] = [
      { id: 1, uptimeMs: 1025, flap: 2, position: FlapPosition.CLOSING },
    ];

    expect(ampOutCsv(samples, marks).split('\n')).toEqual([
      't_ms,uptime_ms,k1_raw,k1_mv,k2_raw,k2_mv,uwagi',
      '0,1000,100,5.04,0,0.00,',
      '20,1020,200,10.07,65535,3300.00,K2 zamykanie',
      '40,1040,300,15.11,0,0.00,',
      '100,1100,400,20.14,0,0.00,przerwa w danych',
      '',
    ]);
  });
});
