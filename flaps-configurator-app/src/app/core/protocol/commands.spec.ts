import { create, toBinary } from '@bufbuild/protobuf';
import {
  baseCommand,
  commandName,
  commandTemplate,
  decodePayload,
  hexByte,
  parseCommand,
} from './commands';
import { Command, ErrorResponseSchema, GetDeviceInfoResponseSchema, Status } from './gen/flaps_pb';

const hex = (text: string): Uint8Array =>
  Uint8Array.from(text.split(/\s+/).map((byte) => parseInt(byte, 16)));

describe('commands', () => {
  it('maps responses and requests to the same command', () => {
    expect(baseCommand(0x81)).toBe(Command.START_SESSION);
    expect(baseCommand(0x01)).toBe(Command.START_SESSION);
    expect(baseCommand(0xff)).toBe(Command.ERROR);
    expect(baseCommand(0x7e)).toBe(0x7e);
  });

  it('names known commands and falls back to hex', () => {
    expect(commandName(0x03)).toBe('PING');
    expect(commandName(0xff)).toBe('ERROR');
    expect(commandName(0x7e)).toBe('0x7E');
    expect(hexByte(0x83)).toBe('0x83');
  });

  it('parses a command by name or number', () => {
    expect(parseCommand('ping')).toBe(Command.PING);
    expect(parseCommand('GET_DEVICE_INFO')).toBe(Command.GET_DEVICE_INFO);
    expect(parseCommand('0x04')).toBe(Command.CLOSE_SESSION);
    expect(parseCommand('ERROR')).toBeNull();
    expect(parseCommand('FOO')).toBeNull();
  });

  it('decodes the README StartSessionResponse payload with all fields', () => {
    expect(decodePayload(0x81, hex('08 01 10 01 18 01 20 C0 3E'))).toEqual({
      status: 'STATUS_OK',
      protocolVersionMajor: 1,
      protocolVersionMinor: 1,
      sessionTimeoutMs: 8000,
    });
  });

  it('decodes an empty request model', () => {
    expect(decodePayload(0x03, new Uint8Array())).toEqual({});
  });

  it('shows bytes fields as hex', () => {
    const payload = toBinary(
      GetDeviceInfoResponseSchema,
      create(GetDeviceInfoResponseSchema, {
        firmwareVersionMajor: 1,
        deviceUid: Uint8Array.from([0x00, 0x1f, 0xab]),
      }),
    );

    expect(decodePayload(0x82, payload)).toMatchObject({ deviceUid: '001FAB' });
  });

  it('decodes ERROR frames', () => {
    const payload = toBinary(
      ErrorResponseSchema,
      create(ErrorResponseSchema, { status: Status.NO_SESSION }),
    );

    expect(decodePayload(0xff, payload)).toEqual({ status: 'STATUS_NO_SESSION' });
  });

  it('builds a console template with all request fields', () => {
    expect(commandTemplate(Command.PING)).toBe('PING');
    expect(commandTemplate(Command.START_SESSION)).toBe(
      'START_SESSION {"appId":0,"protocolVersionMajor":0,"protocolVersionMinor":0}',
    );
  });

  it('returns null for unknown commands and broken payloads', () => {
    expect(decodePayload(0x7e, hex('01 02'))).toBeNull();
    expect(decodePayload(0x81, hex('FF FF FF'))).toBeNull();
  });
});
