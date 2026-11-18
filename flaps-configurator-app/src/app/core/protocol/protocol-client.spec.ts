import { FakeDevice } from '../testing/fake-device';
import { FrameParser } from './frame';
import {
  Command,
  PingRequestSchema,
  PingResponseSchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
  Status,
} from './gen/flaps_pb';
import { APP_ID, ProtocolClient, ProtocolError, ProtocolTimeoutError } from './protocol-client';

describe('ProtocolClient', () => {
  let device: FakeDevice;
  let client: ProtocolClient;

  beforeEach(() => {
    const parser = new FrameParser((frame) => client.handleFrame(frame));
    // Odpowiedź urządzenia przychodzi asynchronicznie, jak notyfikacja BLE
    device = new FakeDevice((bytes) => queueMicrotask(() => parser.push(bytes)));
    client = new ProtocolClient(
      (bytes) => {
        device.write(bytes);
        return Promise.resolve();
      },
      { timeoutMs: 20, retries: 1 },
    );
  });

  const startSession = (): Promise<unknown> =>
    client.request(
      Command.START_SESSION,
      StartSessionRequestSchema,
      { appId: APP_ID, protocolVersionMajor: 1, protocolVersionMinor: 1 },
      StartSessionResponseSchema,
    );

  const ping = (): Promise<unknown> =>
    client.request(Command.PING, PingRequestSchema, {}, PingResponseSchema);

  it('decodes the response to a request', async () => {
    const reply = await client.request(
      Command.START_SESSION,
      StartSessionRequestSchema,
      { appId: APP_ID, protocolVersionMajor: 1, protocolVersionMinor: 1 },
      StartSessionResponseSchema,
    );

    expect(reply.status).toBe(Status.OK);
    expect(reply.sessionTimeoutMs).toBe(8000);
  });

  it('uses a new SEQ for every request', async () => {
    await startSession();
    await ping();

    expect(device.received.map((frame) => frame.seq)).toEqual([1, 2]);
  });

  it('turns an ERROR frame into ProtocolError', async () => {
    await expect(ping()).rejects.toEqual(new ProtocolError(Status.NO_SESSION));
  });

  it('retries with a new SEQ and then reports a timeout', async () => {
    device.responding = false;

    await expect(ping()).rejects.toBeInstanceOf(ProtocolTimeoutError);
    expect(device.received.map((frame) => frame.seq)).toEqual([1, 2]);
  });

  it('starts the response timeout once the frame is sent', async () => {
    // Wysyłka dłuższa niż timeout (małe MTU) — bez ponowienia
    const slow = new ProtocolClient(
      async (bytes) => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        device.write(bytes);
      },
      { timeoutMs: 20, retries: 1 },
    );
    const parser = new FrameParser((frame) => slow.handleFrame(frame));
    device = new FakeDevice((bytes) => queueMicrotask(() => parser.push(bytes)));

    await expect(
      slow.request(Command.PING, PingRequestSchema, {}, PingResponseSchema),
    ).rejects.toEqual(new ProtocolError(Status.NO_SESSION));
    expect(device.received).toHaveLength(1);
  });

  it('rejects pending requests on cancelAll', async () => {
    device.responding = false;
    const request = ping();

    client.cancelAll(new Error('disconnected'));

    await expect(request).rejects.toThrow('disconnected');
  });
});
