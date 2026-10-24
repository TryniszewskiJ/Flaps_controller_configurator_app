import { TestBed } from '@angular/core/testing';
import { BleLinkService } from './ble/ble-link.service';
import { ConnectionService, RECONNECT_DELAY_MS } from './connection.service';
import { FrameLogService } from './frame-log.service';
import { Command, Status } from './protocol/gen/flaps_pb';
import { FakeDevice } from './testing/fake-device';

/** Atrapa łącza BLE: bajty trafiają do FakeDevice, odpowiedzi wracają jak notyfikacje. */
class FakeBleLink {
  device!: FakeDevice;
  connectCalls = 0;
  disconnectCalls = 0;
  failNextConnect = false;
  private onData: ((bytes: Uint8Array) => void) | null = null;
  private onDisconnect: (() => void) | null = null;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.device = new FakeDevice((bytes) => queueMicrotask(() => this.onData?.(bytes)));
  }

  connect(_id: string, onData: (b: Uint8Array) => void, onDisconnect: () => void): Promise<void> {
    this.connectCalls++;
    if (this.failNextConnect) {
      this.failNextConnect = false;
      return Promise.reject(new Error('Connection timeout'));
    }
    this.onData = onData;
    this.onDisconnect = onDisconnect;
    return Promise.resolve();
  }

  write(bytes: Uint8Array): Promise<void> {
    this.device.write(bytes);
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.disconnectCalls++;
    this.onData = null;
    return Promise.resolve();
  }

  readDeviceName(): Promise<string | null> {
    return Promise.resolve('DK_flaps_controller');
  }

  /** Utrata zasięgu — system zgłasza rozłączenie. */
  dropConnection(): void {
    this.onData = null;
    this.onDisconnect?.();
  }
}

describe('ConnectionService', () => {
  let service: ConnectionService;
  let link: FakeBleLink;

  const commands = (): Command[] => link.device.received.map((frame) => frame.command);

  beforeEach(() => {
    link = new FakeBleLink();
    TestBed.configureTestingModule({ providers: [{ provide: BleLinkService, useValue: link }] });
    service = TestBed.inject(ConnectionService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts disconnected', () => {
    expect(service.status()).toBe('disconnected');
    expect(service.connected()).toBe(false);
  });

  it('opens a session and reads device info', async () => {
    await service.connect({ deviceId: 'AA:BB' });

    expect(service.status()).toBe('connected');
    expect(service.deviceName()).toBe('DK_flaps_controller');
    expect(service.deviceInfo()).toEqual({ firmwareVersion: '1.2.3', uid: 'ab'.repeat(12) });
    expect(commands()).toEqual([Command.START_SESSION, Command.GET_DEVICE_INFO]);
  });

  it('logs sent and received frames', async () => {
    await service.connect({ deviceId: 'AA:BB' });

    const log = TestBed.inject(FrameLogService).entries();
    expect(log.map((entry) => `${entry.direction} ${entry.name} ${entry.code}`)).toEqual([
      'tx START_SESSION 0x01',
      'rx START_SESSION 0x81',
      'tx GET_DEVICE_INFO 0x02',
      'rx GET_DEVICE_INFO 0x82',
    ]);
    expect(log[1].payload).toContain('"status":"STATUS_OK"');
  });

  it('sends a console command with a JSON payload', async () => {
    await service.connect({ deviceId: 'AA:BB' });

    await service.sendCommand(Command.PING, {});

    expect(commands()).toContain(Command.PING);
  });

  it('rejects console commands while disconnected', async () => {
    await expect(service.sendCommand(Command.PING, {})).rejects.toThrow('Brak połączenia');
  });

  it('sends CLOSE_SESSION and disconnects BLE on disconnect', async () => {
    await service.connect({ deviceId: 'AA:BB' });
    await service.disconnect();

    expect(commands()).toContain(Command.CLOSE_SESSION);
    expect(link.disconnectCalls).toBeGreaterThan(0);
    expect(service.status()).toBe('disconnected');
    expect(service.deviceInfo()).toBeNull();
  });

  it('reports an error when the first connection fails', async () => {
    link.failNextConnect = true;

    await service.connect({ deviceId: 'AA:BB' });

    expect(service.status()).toBe('disconnected');
    expect(service.error()).toContain('poza zasięgiem');
  });

  it('does not retry when the device rejects the app', async () => {
    link.device.startSessionStatus = Status.UNKNOWN_APP;

    await service.connect({ deviceId: 'AA:BB' });

    expect(service.status()).toBe('disconnected');
    expect(service.error()).toContain('nie obsługuje');
  });

  it('reconnects after the link is lost until it succeeds', async () => {
    vi.useFakeTimers();
    await service.connect({ deviceId: 'AA:BB' });

    link.dropConnection();
    expect(service.status()).toBe('reconnecting');

    link.reset();
    link.failNextConnect = true;
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);
    expect(service.status()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);
    expect(service.status()).toBe('connected');
    expect(link.connectCalls).toBe(3);
  });

  it('stops reconnecting after disconnect', async () => {
    vi.useFakeTimers();
    await service.connect({ deviceId: 'AA:BB' });
    link.dropConnection();

    await service.disconnect();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 3);

    expect(service.status()).toBe('disconnected');
    expect(link.connectCalls).toBe(1);
  });

  it('pings the device and reopens the session after NO_SESSION', async () => {
    vi.useFakeTimers();
    await service.connect({ deviceId: 'AA:BB' });

    // ping co 1/3 timeoutu sesji (8000 ms)
    await vi.advanceTimersByTimeAsync(2666);
    expect(commands()).toContain(Command.PING);

    link.device.sessionActive = false; // np. reset STM32
    await vi.advanceTimersByTimeAsync(2666);

    expect(commands().filter((c) => c === Command.START_SESSION)).toHaveLength(2);
    expect(service.status()).toBe('connected');
  });
});
