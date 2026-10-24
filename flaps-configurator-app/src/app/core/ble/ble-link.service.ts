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

  /** Na webie urządzenie wybiera się w oknie przeglądarki, bez własnej listy. */
  get usesBrowserPicker(): boolean {
    return !Capacitor.isNativePlatform();
  }

  /** Uprawnienia Bluetooth i włączenie modułu (Android pyta użytkownika). */
  async prepare(): Promise<void> {
    if (!this.initialized) {
      await BleClient.initialize({ androidNeverForLocation: true });
      this.initialized = true;
    }
    if (Capacitor.getPlatform() === 'android' && !(await BleClient.isEnabled())) {
      await BleClient.requestEnable();
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
    await this.prepare();
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
    await BleClient.connect(deviceId, () => onDisconnect(), { timeout: CONNECT_TIMEOUT_MS });
    this.deviceId = deviceId;
    this.chunkSize = DEFAULT_ATT_MTU - 3;

    try {
      await BleClient.startNotifications(
        deviceId,
        BRIDGE_SERVICE_UUID,
        BRIDGE_TX_CHARACTERISTIC_UUID,
        (value) => onData(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
        { timeout: PAIRING_TIMEOUT_MS },
      );
      this.chunkSize = (await this.readMtu(deviceId)) - 3;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const deviceId = this.deviceId;
    this.deviceId = null;
    if (deviceId) {
      await BleClient.disconnect(deviceId);
    }
  }

  /** Zapis z potwierdzeniem, w kawałkach mieszczących się w MTU. */
  async write(bytes: Uint8Array): Promise<void> {
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

  private async readMtu(deviceId: string): Promise<number> {
    try {
      return await BleClient.getMtu(deviceId);
    } catch {
      return DEFAULT_ATT_MTU; // getMtu nie jest dostępne na każdej platformie
    }
  }
}
