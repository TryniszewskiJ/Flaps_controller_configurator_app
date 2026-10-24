import { create, toBinary } from '@bufbuild/protobuf';
import { crc16, encodeFrame, Frame, FrameParser } from './frame';
import { StartSessionRequestSchema } from './gen/flaps_pb';

const hex = (text: string): Uint8Array =>
  Uint8Array.from(text.split(/\s+/).map((byte) => parseInt(byte, 16)));

// Przykładowe ramki z README firmware STM32
const START_SESSION = hex('A5 01 01 09 00 0D 50 41 4C 46 10 01 18 01 75 EF');
const START_SESSION_RESPONSE = hex('A5 81 01 09 00 08 01 10 01 18 01 20 C0 3E 46 8A');
const PING = hex('A5 03 03 00 00 4C 46');
const ERROR_NO_SESSION = hex('A5 FF 03 02 00 08 02 FE F0');

describe('crc16', () => {
  it('matches the CRC-16/CCITT-FALSE check value', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x29b1);
  });
});

describe('encodeFrame', () => {
  it.each([
    ['GET_DEVICE_INFO', 0x02, 2, 'A5 02 02 00 00 C8 07'],
    ['PING', 0x03, 3, 'A5 03 03 00 00 4C 46'],
    ['CLOSE_SESSION', 0x04, 4, 'A5 04 04 00 00 F1 92'],
  ])('encodes %s like the README example', (_name, command, seq, expected) => {
    expect(encodeFrame({ command, seq, payload: new Uint8Array() })).toEqual(hex(expected));
  });

  it('encodes START_SESSION with the protobuf payload like the README example', () => {
    const payload = toBinary(
      StartSessionRequestSchema,
      create(StartSessionRequestSchema, {
        appId: 0x464c4150,
        protocolVersionMajor: 1,
        protocolVersionMinor: 1,
      }),
    );

    expect(encodeFrame({ command: 0x01, seq: 1, payload })).toEqual(START_SESSION);
  });

  it('rejects a payload over 256 bytes', () => {
    expect(() => encodeFrame({ command: 1, seq: 1, payload: new Uint8Array(257) })).toThrow(
      RangeError,
    );
  });
});

describe('FrameParser', () => {
  let frames: Frame[];
  let now: number;
  let parser: FrameParser;

  beforeEach(() => {
    frames = [];
    now = 0;
    parser = new FrameParser(
      (frame) => frames.push(frame),
      200,
      () => now,
    );
  });

  it('parses a complete frame', () => {
    parser.push(START_SESSION_RESPONSE);

    expect(frames).toHaveLength(1);
    expect(frames[0].command).toBe(0x81);
    expect(frames[0].seq).toBe(1);
    expect(frames[0].payload).toEqual(hex('08 01 10 01 18 01 20 C0 3E'));
  });

  it('joins a frame split into chunks', () => {
    parser.push(START_SESSION_RESPONSE.subarray(0, 3));
    parser.push(START_SESSION_RESPONSE.subarray(3, 10));
    expect(frames).toHaveLength(0);

    parser.push(START_SESSION_RESPONSE.subarray(10));
    expect(frames).toHaveLength(1);
  });

  it('parses several frames from one chunk', () => {
    parser.push(Uint8Array.from([...PING, ...ERROR_NO_SESSION]));

    expect(frames.map((frame) => frame.command)).toEqual([0x03, 0xff]);
  });

  it('skips garbage and a frame with a bad CRC', () => {
    const corrupted = Uint8Array.from(PING);
    corrupted[corrupted.length - 1] ^= 0xff;

    parser.push(Uint8Array.from([0x00, 0x13, ...corrupted, ...ERROR_NO_SESSION]));

    expect(frames).toHaveLength(1);
    expect(frames[0].command).toBe(0xff);
  });

  it('drops an unfinished frame after the timeout', () => {
    parser.push(PING.subarray(0, 4));
    now = 250;
    parser.push(ERROR_NO_SESSION);

    expect(frames).toHaveLength(1);
    expect(frames[0].command).toBe(0xff);
  });
});
