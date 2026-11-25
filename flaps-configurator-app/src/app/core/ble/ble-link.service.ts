import { Injectable } from '@angular/core';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

/**
 * GATT mostka nRF52 (NRF52_UART_BLE_BRIDGE/ble_uart_bridge/src/ble.h).
 * Urządzenie rozgłasza tylko UUID serwisu, bez nazwy — po nim filtrujemy "swoje" urządzenia.
 */
export const BRIDGE_SERVICE_UUID = '6a756861-9ef3-40e8-b49b-2c98a6bb47fb';
/** Zapis: aplikacja -> STM32. */
export const BRIDGE_RX_CHARACTERISTIC_UUID = '63a1f737-d934-4d24-be30-92b242379fb3';
/** Notyfikacje: STM32 -> aplikacja. */
export const BRIDGE_TX_CHARACTERISTIC_UUID = '52fa30a9-0084-40f5-9782-ef6f0c91206d';

const GAP_SERVICE_UUID = '00001800-0000-1000-8000-00805f9b34fb';
const GAP_DEVICE_NAME_UUID = '00002a00-0000-1000-8000-00805f9b34fb';

/** ATT MTU bez negocjacji; payload zapisu/notyfikacji to MTU - 3. */
const DEFAULT_ATT_MTU = 23;
const CONNECT_TIMEOUT_MS = 15_000;
// Włączenie notyfikacji wymaga sparowania z kluczem — czas na wpisanie go przez użytkownika
const PAIRING_TIMEOUT_MS = 60_000;

/** Sterownik nie dokończył parowania / szyfrowania w czasie (Electron). */
export class PairingTimeoutError extends Error {
  constructor() {
    super('Pairing timeout');
  }
}

export interface FoundDevice {
  deviceId: string;
  name?: string;
  rssi?: number;
}

/** Połączenie BLE z mostkiem nRF52: przezroczysty kanał bajtów do STM32. */
@Injectable({ providedIn: 'root' })
export class BleLinkService {
  private initialized = false;
  private deviceId: string | null = null;
  private chunkSize = DEFAULT_ATT_MTU - 3;
  private writeQueue: Promise<void> = Promise.resolve();
  private initializing: Promise<void> | null = null;

  /** Na webie urządzenie wybiera się w oknie przeglądarki, bez własnej listy. */
  get usesBrowserPicker(): boolean {
    return !Capacitor.isNativePlatform();
  }

  /** Uprawnienia Bluetooth i włączenie modułu (Android pyta użytkownika). */
  async prepare(): Promise<void> {
    if (!this.initialized) {
      // Wspólna inicjalizacja dla warmUp() i kliknięcia „Połącz”
      this.initializing ??= BleClient.initialize({ androidNeverForLocation: true }).finally(
        () => (this.initializing = null),
      );
      await this.initializing;
      this.initialized = true;
    }
    if (Capacitor.getPlatform() === 'android' && !(await BleClient.isEnabled())) {
      await BleClient.requestEnable();
    }
  }

  /**
   * Web / Electron: inicjalizacja przy starcie aplikacji. requestDevice() musi paść zaraz po
   * kliknięciu — gdy pierwsze „Połącz” czekało na getAvailability() (na macOS adapter
   * startuje chwilę), Chromium przerywał wybór urządzenia i okno od razu znikało.
   */
  warmUp(): void {
    if (this.usesBrowserPicker) {
      this.prepare().catch(() => undefined); // błąd (np. brak Bluetooth) pokaże „Połącz”
    }
  }

  async startScan(onDevice: (device: FoundDevice) => void): Promise<void> {
    await this.prepare();
    await BleClient.requestLEScan({ services: [BRIDGE_SERVICE_UUID] }, (result: ScanResult) =>
      onDevice({
        deviceId: result.device.deviceId,
        name: result.localName ?? result.device.name,
        rssi: result.rssi,
      }),
    );
  }

  async stopScan(): Promise<void> {
    if (this.initialized) {
      await BleClient.stopLEScan();
    }
  }

  /** Okno wyboru urządzenia przeglądarki (Web Bluetooth). */
  async requestDeviceInBrowser(): Promise<FoundDevice> {
    if (!this.initialized) {
      await this.prepare();
    }
    const device = await BleClient.requestDevice({
      services: [BRIDGE_SERVICE_UUID],
      optionalServices: [GAP_SERVICE_UUID],
    });
    return { deviceId: device.deviceId, name: device.name };
  }

  /**
   * Łączy, włącza notyfikacje (przy pierwszym połączeniu system poprosi o klucz
   * parowania) i ustala rozmiar kawałka zapisu z MTU.
   */
  async connect(
    deviceId: string,
    onData: (bytes: Uint8Array) => void,
    onDisconnect: () => void,
  ): Promise<void> {
    await this.prepare();
    if (Capacitor.getPlatform() === 'ios') {
      // iOS łączy tylko z urządzeniem znanym wtyczce — po starcie aplikacji (automatyczne
      // łączenie z ostatnim sterownikiem) nie było skanowania, więc pobieramy je po UUID
      await BleClient.getDevices([deviceId]).catch(() => undefined);
    }
    await BleClient.connect(deviceId, () => onDisconnect(), { timeout: CONNECT_TIMEOUT_MS });
    this.deviceId = deviceId;
    this.chunkSize = DEFAULT_ATT_MTU - 3;

    try {
      const notifications = BleClient.startNotifications(
        deviceId,
        BRIDGE_SERVICE_UUID,
        BRIDGE_TX_CHARACTERISTIC_UUID,
        (value) => {
          this.learnMtuFromNotification(value.byteLength);
          onData(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        },
        { timeout: PAIRING_TIMEOUT_MS },
      );
      // Web Bluetooth (Electron) nie ma limitu czasu na włączenie notyfikacji — Windows ze starym
      // sparowaniem (klucze, których mostek już nie zna) czeka na szyfrowanie w nieskończoność
      await (this.usesBrowserPicker
        ? withTimeout(notifications, PAIRING_TIMEOUT_MS, () => new PairingTimeoutError())
        : notifications);
      this.chunkSize = (await this.readMtu(deviceId)) - 3;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const deviceId = this.deviceId;
    this.deviceId = null;
    if (!deviceId) {
      return;
    }
    // Wtyczka wykonuje operacje po kolei — rozłączenie nie może czekać za zawieszoną (np.
    // włączaniem notyfikacji bez odpowiedzi). Poza kolejką, potem nowa, pusta kolejka.
    BleClient.disableQueue();
    try {
      await BleClient.disconnect(deviceId);
    } finally {
      BleClient.enableQueue();
    }
  }

  /**
   * Zapis z potwierdzeniem, w kawałkach mieszczących się w MTU. Zapisy idą po kolei —
   * kawałki dwóch ramek (np. ponowienie i odczyt stanu) nie mogą się przeplatać.
   */
  write(bytes: Uint8Array): Promise<void> {
    const write = this.writeQueue.then(() => this.writeChunks(bytes));
    this.writeQueue = write.catch(() => undefined);
    return write;
  }

  private async writeChunks(bytes: Uint8Array): Promise<void> {
    const deviceId = this.deviceId;
    if (!deviceId) {
      throw new Error('Not connected');
    }

    for (let offset = 0; offset < bytes.length; offset += this.chunkSize) {
      const chunk = bytes.slice(offset, offset + this.chunkSize);
      await BleClient.write(
        deviceId,
        BRIDGE_SERVICE_UUID,
        BRIDGE_RX_CHARACTERISTIC_UUID,
        new DataView(chunk.buffer),
      );
    }
  }

  /** Nazwa z usługi GAP (urządzenie nie rozgłasza jej w reklamie). */
  async readDeviceName(): Promise<string | null> {
    if (!this.deviceId) {
      return null;
    }
    try {
      const value = await BleClient.read(this.deviceId, GAP_SERVICE_UUID, GAP_DEVICE_NAME_UUID);
      return new TextDecoder().decode(value).trim() || null;
    } catch {
      return null; // np. przeglądarka blokuje odczyt GAP
    }
  }

  /**
   * Web Bluetooth (Electron na Windows/macOS) nie podaje MTU. Mostek wysyła notyfikacje
   * o długości do MTU - 3, więc najdłuższa odebrana to dolna granica kawałka zapisu.
   * Na Androidzie i iOS MTU podaje system (readMtu).
   */
  private learnMtuFromNotification(length: number): void {
    if (!Capacitor.isNativePlatform() && length > this.chunkSize) {
      this.chunkSize = length;
    }
  }

  private async readMtu(deviceId: string): Promise<number> {
    try {
      // Android zwraca -1, gdy negocjacja MTU się nie udała
      const mtu = await BleClient.getMtu(deviceId);
      return mtu > DEFAULT_ATT_MTU ? mtu : DEFAULT_ATT_MTU;
    } catch {
      return DEFAULT_ATT_MTU; // getMtu nie jest dostępne na każdej platformie
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, error: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(error()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason: unknown) => {
        clearTimeout(timer);
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      },
    );
  });
}
