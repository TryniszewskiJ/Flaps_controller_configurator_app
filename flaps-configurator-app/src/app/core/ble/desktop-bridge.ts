/**
 * Mostek do procesu głównego Electrona (electron/preload.cjs). Istnieje tylko w aplikacji
 * desktopowej — Electron nie ma własnego okna wyboru urządzenia BLE ani okna parowania,
 * więc obsługuje je aplikacja.
 */

export interface DesktopBluetoothDevice {
  deviceId: string;
  name: string;
}

/** Rodzaje parowania z Electron `setBluetoothPairingHandler` (Windows, Linux). */
export type DesktopPairingKind = 'confirm' | 'confirmPin' | 'providePin';

export interface DesktopPairingRequest {
  kind: DesktopPairingKind;
  /** Kod do potwierdzenia (confirmPin). */
  pin?: string;
}

export interface DesktopPairingResponse {
  confirmed: boolean;
  /** Kod wpisany przez użytkownika (providePin). */
  pin?: string;
}

export interface FlapsDesktopBridge {
  platform: string;
  bluetooth: {
    /** Lista znalezionych urządzeń w trakcie wyboru (navigator.bluetooth.requestDevice). */
    onDevices(callback: (devices: DesktopBluetoothDevice[]) => void): () => void;
    selectDevice(deviceId: string): void;
    cancelSelection(): void;
    onPairingRequest(callback: (request: DesktopPairingRequest) => void): () => void;
    respondToPairing(response: DesktopPairingResponse): void;
  };
}

declare global {
  interface Window {
    flapsDesktop?: FlapsDesktopBridge;
  }
}
