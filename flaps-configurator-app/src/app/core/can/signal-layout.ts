/**
 * Położenie sygnału w ramce klasycznego CAN — numeracja bitów jak w plikach DBC
 * (bit = bajt * 8 + bit w bajcie), ta sama co w SignalExtractor firmware.
 *
 * - Intel (little endian): startingBit = LSB, kolejne bity w górę przez bajty.
 * - Motorola (big endian): startingBit = MSB, w bajcie w dół do bitu 0, potem bit 7
 *   następnego bajtu.
 */
export const FRAME_BYTES = 8;
export const FRAME_BITS = FRAME_BYTES * 8;
export const MAX_SIGNAL_BITS = 64;

export interface SignalLayout {
  startingBit: number;
  lengthBits: number;
  bigEndian: boolean;
}

/**
 * Pozycja bitu w kolejności Motoroli: bajt 0 od bitu 7 do 0, potem bajt 1 od bitu 7…
 * W tej kolejności sygnał Motoroli zajmuje kolejne pozycje od MSB.
 */
export function motorolaPosition(bit: number): number {
  return Math.floor(bit / 8) * 8 + 7 - (bit % 8);
}

export function bitAtMotorolaPosition(position: number): number {
  return Math.floor(position / 8) * 8 + 7 - (position % 8);
}

/**
 * Bity sygnału od MSB do LSB. Null, gdy sygnał nie mieści się w 8 bajtach albo
 * długość jest spoza 1..64 (jak signalFitsInFrame() w firmware).
 */
export function signalBits(layout: SignalLayout): number[] | null {
  const { startingBit: start, lengthBits: length, bigEndian } = layout;
  if (!isBitIndex(start) || !Number.isInteger(length) || length < 1 || length > MAX_SIGNAL_BITS) {
    return null;
  }

  if (bigEndian) {
    const first = motorolaPosition(start);
    if (first + length > FRAME_BITS) {
      return null;
    }
    return Array.from({ length }, (_, i) => bitAtMotorolaPosition(first + i));
  }

  if (start + length > FRAME_BITS) {
    return null;
  }
  return Array.from({ length }, (_, i) => start + length - 1 - i);
}

/**
 * Położenie sygnału zaznaczonego od bitu `from` do bitu `to` (w dowolnej kolejności)
 * w danej kolejności bajtów — tak działa zaznaczanie w siatce bitów.
 */
export function layoutFromRange(from: number, to: number, bigEndian: boolean): SignalLayout {
  if (bigEndian) {
    const a = motorolaPosition(from);
    const b = motorolaPosition(to);
    return {
      startingBit: bitAtMotorolaPosition(Math.min(a, b)),
      lengthBits: Math.abs(a - b) + 1,
      bigEndian,
    };
  }
  return { startingBit: Math.min(from, to), lengthBits: Math.abs(from - to) + 1, bigEndian };
}

/**
 * Zakres wartości fizycznej: surowe 0..2^n−1 (bez znaku) albo −2^(n−1)..2^(n−1)−1 (U2)
 * razy skala plus offset.
 */
export function valueRange(
  lengthBits: number,
  scale: number,
  bias: number,
  signed = false,
): [number, number] {
  const rawMin = signed ? -(2 ** (lengthBits - 1)) : 0;
  const rawMax = signed ? 2 ** (lengthBits - 1) - 1 : 2 ** lengthBits - 1;
  const a = rawMin * scale + bias;
  const b = rawMax * scale + bias;
  return a <= b ? [a, b] : [b, a];
}

function isBitIndex(bit: number): boolean {
  return Number.isInteger(bit) && bit >= 0 && bit < FRAME_BITS;
}
