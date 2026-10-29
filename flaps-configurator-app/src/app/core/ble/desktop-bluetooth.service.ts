import { Injectable, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import {
  DesktopBluetoothDevice,
  DesktopPairingRequest,
  FlapsDesktopBridge,
} from './desktop-bridge';

/**
 * Bluetooth w aplikacji desktopowej (Electron): lista urządzeń do okna wyboru
 * i okno parowania z kluczem (na Windows prosi o nie Electron, na macOS — system).
 */
@Injectable({ providedIn: 'root' })
export class DesktopBluetoothService {
  private readonly alerts = inject(AlertController);
  private readonly bridge: FlapsDesktopBridge | undefined = window.flapsDesktop;
  private started = false;

  get available(): boolean {
    return this.bridge !== undefined;
  }

  /** Obsługa próśb o parowanie; wołane raz przy starcie aplikacji. */
  start(): void {
    if (!this.bridge || this.started) {
      return;
    }
    this.started = true;
    this.bridge.bluetooth.onPairingRequest((request) => void this.showPairing(request));
  }

  onDevices(callback: (devices: DesktopBluetoothDevice[]) => void): () => void {
    return this.bridge?.bluetooth.onDevices(callback) ?? ((): void => undefined);
  }

  selectDevice(deviceId: string): void {
    this.bridge?.bluetooth.selectDevice(deviceId);
  }

  cancelSelection(): void {
    this.bridge?.bluetooth.cancelSelection();
  }

  private async showPairing(request: DesktopPairingRequest): Promise<void> {
    const bluetooth = this.bridge?.bluetooth;
    if (!bluetooth) {
      return;
    }

    const respond = (confirmed: boolean, pin?: string): void =>
      bluetooth.respondToPairing({ confirmed, pin });

    const alert =
      request.kind === 'providePin'
        ? await this.alerts.create({
            header: 'Parowanie',
            message: 'Wpisz kod parowania sterownika.',
            backdropDismiss: false,
            inputs: [{ name: 'pin', type: 'number', placeholder: 'Kod parowania' }],
            buttons: [
              { text: 'Anuluj', role: 'cancel', handler: (): void => respond(false) },
              {
                text: 'Sparuj',
                handler: (values: { pin?: string }): void => respond(true, values.pin?.trim()),
              },
            ],
          })
        : await this.alerts.create({
            header: 'Parowanie',
            message:
              request.kind === 'confirmPin'
                ? `Czy sterownik pokazuje kod ${request.pin}?`
                : 'Sparować aplikację ze sterownikiem?',
            backdropDismiss: false,
            buttons: [
              { text: 'Anuluj', role: 'cancel', handler: (): void => respond(false) },
              { text: 'Sparuj', handler: (): void => respond(true) },
            ],
          });

    await alert.present();
  }
}
