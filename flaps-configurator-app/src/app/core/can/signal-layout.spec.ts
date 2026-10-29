import { layoutFromRange, signalBits, valueRange } from './signal-layout';

describe('signalBits', () => {
  // Domyślna konfiguracja firmware: RPM w 0x180
  it('walks a Motorola signal down the byte, then from bit 7 of the next byte', () => {
    expect(signalBits({ startingBit: 7, lengthBits: 16, bigEndian: true })).toEqual([
      7, 6, 5, 4, 3, 2, 1, 0, 15, 14, 13, 12, 11, 10, 9, 8,
    ]);
  });

  // Domyślna konfiguracja firmware: Drive mode w 0x56C
  it('keeps a short Motorola signal inside one byte', () => {
    expect(signalBits({ startingBit: 13, lengthBits: 3, bigEndian: true })).toEqual([13, 12, 11]);
  });

  it('crosses a byte boundary for a Motorola signal starting low in the byte', () => {
    expect(signalBits({ startingBit: 1, lengthBits: 4, bigEndian: true })).toEqual([1, 0, 15, 14]);
  });

  it('goes up from the LSB for an Intel signal (MSB first in the result)', () => {
    expect(signalBits({ startingBit: 6, lengthBits: 4, bigEndian: false })).toEqual([9, 8, 7, 6]);
  });

  it.each([
    ['Intel past byte 7', { startingBit: 60, lengthBits: 8, bigEndian: false }],
    ['Motorola past byte 7', { startingBit: 59, lengthBits: 8, bigEndian: true }],
    ['zero length', { startingBit: 0, lengthBits: 0, bigEndian: false }],
    ['start bit past the frame', { startingBit: 64, lengthBits: 1, bigEndian: false }],
  ])('rejects a signal that does not fit: %s', (_name, layout) => {
    expect(signalBits(layout)).toBeNull();
  });

  it('accepts a full 64-bit signal in both byte orders', () => {
    expect(signalBits({ startingBit: 0, lengthBits: 64, bigEndian: false })).toHaveLength(64);
    expect(signalBits({ startingBit: 7, lengthBits: 64, bigEndian: true })).toHaveLength(64);
  });
});

describe('layoutFromRange', () => {
  it('starts a Motorola selection at the MSB regardless of tap order', () => {
    const expected = { startingBit: 7, lengthBits: 16, bigEndian: true };
    expect(layoutFromRange(7, 8, true)).toEqual(expected);
    expect(layoutFromRange(8, 7, true)).toEqual(expected);
  });

  it('starts an Intel selection at the LSB regardless of tap order', () => {
    const expected = { startingBit: 4, lengthBits: 9, bigEndian: false };
    expect(layoutFromRange(12, 4, false)).toEqual(expected);
    expect(layoutFromRange(4, 12, false)).toEqual(expected);
  });

  it('selects one bit when both taps hit the same cell', () => {
    expect(layoutFromRange(13, 13, true)).toEqual({
      startingBit: 13,
      lengthBits: 1,
      bigEndian: true,
    });
  });

  it('round-trips with signalBits', () => {
    const layout = layoutFromRange(13, 11, true);
    const bits = signalBits(layout);
    expect(bits?.[0]).toBe(13);
    expect(bits?.at(-1)).toBe(11);
  });
});

describe('valueRange', () => {
  it('scales the raw unsigned range', () => {
    expect(valueRange(16, 0.125, 0)).toEqual([0, 8191.875]);
  });

  it('orders the range for a negative scale', () => {
    expect(valueRange(8, -1, 10)).toEqual([-245, 10]);
  });

  it("uses the two's complement range for signed signals", () => {
    expect(valueRange(8, 1, 0, true)).toEqual([-128, 127]);
    expect(valueRange(12, 0.5, 100, true)).toEqual([-924, 1123.5]);
    expect(valueRange(1, 1, 0, true)).toEqual([-1, 0]);
  });
});
