/**
 * Warstwa ramek protokołu sterownika (README firmware STM32, sekcja "Ramka"):
 *
 *   | 0xA5 | CMD | SEQ | LEN_L | LEN_H | PAYLOAD[LEN] | CRC_L | CRC_H |
 *
 * CRC-16/CCITT-FALSE liczone z CMD, SEQ, LEN i PAYLOAD.
 */

export const FRAME_SOF = 0xa5;
export const MAX_PAYLOAD_LENGTH = 256;

const HEADER_LENGTH = 5; // SOF, CMD, SEQ, LEN_L, LEN_H
const CRC_LENGTH = 2;

export interface Frame {
  command: number;
  seq: number;
  payload: Uint8Array;
}

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, bez odbicia i XOR na końcu. */
export function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function encodeFrame({ command, seq, payload }: Frame): Uint8Array {
  if (payload.length > MAX_PAYLOAD_LENGTH) {
    throw new RangeError(`Payload too long: ${payload.length} B (max ${MAX_PAYLOAD_LENGTH})`);
  }

  const frame = new Uint8Array(HEADER_LENGTH + payload.length + CRC_LENGTH);
  frame[0] = FRAME_SOF;
  frame[1] = command & 0xff;
  frame[2] = seq & 0xff;
  frame[3] = payload.length & 0xff;
  frame[4] = payload.length >> 8;
  frame.set(payload, HEADER_LENGTH);

  const crc = crc16(frame.subarray(1, HEADER_LENGTH + payload.length));
  frame[HEADER_LENGTH + payload.length] = crc & 0xff;
  frame[HEADER_LENGTH + payload.length + 1] = crc >> 8;
  return frame;
}

/**
 * Składa ramki z kawałków danych (notyfikacje BLE dzielą ramki dowolnie).
 * Po błędnym CRC albo zbyt długim LEN szuka kolejnego 0xA5, a niedokończona ramka
 * jest porzucana po `timeoutMs` bez nowych bajtów — tak samo jak UsartClient w firmware.
 */
export class FrameParser {
  private buffer: number[] = [];
  private lastByteAt = 0;

  constructor(
    private readonly onFrame: (frame: Frame) => void,
    private readonly timeoutMs = 200,
    private readonly now: () => number = Date.now,
  ) {}

  push(chunk: Uint8Array): void {
    const now = this.now();
    if (this.buffer.length > 0 && now - this.lastByteAt > this.timeoutMs) {
      this.buffer = [];
    }
    this.lastByteAt = now;

    this.buffer.push(...chunk);
    this.parse();
  }

  reset(): void {
    this.buffer = [];
  }

  private parse(): void {
    for (;;) {
      const sof = this.buffer.indexOf(FRAME_SOF);
      if (sof < 0) {
        this.buffer = [];
        return;
      }
      if (sof > 0) {
        this.buffer.splice(0, sof);
      }
      if (this.buffer.length < HEADER_LENGTH) {
        return;
      }

      const length = this.buffer[3] | (this.buffer[4] << 8);
      if (length > MAX_PAYLOAD_LENGTH) {
        this.buffer.shift(); // to nie był początek ramki
        continue;
      }

      const total = HEADER_LENGTH + length + CRC_LENGTH;
      if (this.buffer.length < total) {
        return;
      }

      const bytes = Uint8Array.from(this.buffer.slice(0, total));
      const expected = crc16(bytes.subarray(1, HEADER_LENGTH + length));
      const received = bytes[total - 2] | (bytes[total - 1] << 8);
      if (expected !== received) {
        this.buffer.shift();
        continue;
      }

      this.buffer.splice(0, total);
      this.onFrame({
        command: bytes[1],
        seq: bytes[2],
        payload: bytes.slice(HEADER_LENGTH, HEADER_LENGTH + length),
      });
    }
  }
}
