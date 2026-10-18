import { Injectable, computed, signal } from '@angular/core';

/** Stan połączenia ze sterownikiem klap. */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private readonly _deviceName = signal<string | null>(null);

  /** Nazwa połączonego urządzenia; null, gdy brak połączenia. */
  readonly deviceName = this._deviceName.asReadonly();
  readonly connected = computed(() => this._deviceName() !== null);

  // TODO: połączenie przez BLE (@capacitor-community/bluetooth-le). Na razie mock stanu UI.
  connect(): Promise<void> {
    this._deviceName.set('Flaps Controller');
    return Promise.resolve();
  }

  disconnect(): void {
    this._deviceName.set(null);
  }
}
