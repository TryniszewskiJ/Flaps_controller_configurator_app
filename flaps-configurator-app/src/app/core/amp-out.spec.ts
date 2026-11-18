import { ampOutAmps, ampOutMillivolts, formatAmpOutMillivolts } from './amp-out';

describe('AMP_OUT', () => {
  it('converts the raw ADC reading to millivolts', () => {
    expect(ampOutMillivolts(0)).toBe(0);
    expect(ampOutMillivolts(65535)).toBe(3300);
    expect(formatAmpOutMillivolts(80)).toBe('4.0 mV');
  });

  it('computes current only with a known shunt and gain', () => {
    expect(ampOutAmps(65535, { shuntOhms: null, gain: null })).toBeNull();
    expect(ampOutAmps(65535, { shuntOhms: 0.1, gain: 0 })).toBeNull();
    // 3,3 V / (0,1 Ω × 20) = 1,65 A
    expect(ampOutAmps(65535, { shuntOhms: 0.1, gain: 20 })).toBeCloseTo(1.65);
  });
});
