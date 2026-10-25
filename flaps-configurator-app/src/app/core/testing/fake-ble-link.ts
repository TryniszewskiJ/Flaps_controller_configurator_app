import { FakeDevice } from './fake-device';

/** Atrapa łącza BLE: bajty trafiają do FakeDevice, odpowiedzi wracają jak notyfikacje. */
export class FakeBleLink {
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
