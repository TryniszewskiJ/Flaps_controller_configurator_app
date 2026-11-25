import { Injectable, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import {
  DesktopBluetoothDevice,
  DesktopPairingRequest,
  FlapsDesktopBridge,
} from './desktop-bridge';
import { t } from '../i18n/i18n';

/**
 * Bluetooth w aplikacji desktopowej (Electron): lista urządzeń do okna wyboru
 * i okno parowania z kluczem (na Windows prosi o nie Electron, na macOS — system).
 */
@Injectable({ providedIn: 'root' })
export class DesktopBluetoothService {
  private readonly alerts = inject(AlertController);
  private readonly bridge: FlapsDesktopBridge | undefined = window.flapsDesktop;
  private started = false;
  private _selectedId: string | null = null;

  /**
   * Identyfikator urządzenia z ostatniego wyboru (okno wyboru albo autoSelect) — do ponownego
   * wybrania przy automatycznym łączeniu. Inny niż deviceId z Web Bluetooth (ten jest losowy).
   */
  get selectedId(): string | null {
    return this._selectedId;
  }

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
    this._selectedId = deviceId;
    this.bridge?.bluetooth.selectDevice(deviceId);
  }

  /** Następny requestDevice() wybierze samo `deviceId` (bez okna wyboru i bez kliknięcia). */
  async autoSelect(deviceId: string): Promise<void> {
    this._selectedId = deviceId;
    await this.bridge?.bluetooth.autoSelect(deviceId);
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
            header: t('pairing.title'),
            message: t('pairing.enterPin'),
            backdropDismiss: false,
            inputs: [{ name: 'pin', type: 'number', placeholder: t('pairing.pinPlaceholder') }],
            buttons: [
              { text: t('common.cancel'), role: 'cancel', handler: (): void => respond(false) },
              {
                text: t('pairing.pair'),
                handler: (values: { pin?: string }): void => respond(true, values.pin?.trim()),
              },
            ],
          })
        : await this.alerts.create({
            header: t('pairing.title'),
            message:
              request.kind === 'confirmPin'
                ? t('pairing.confirmPin', { pin: request.pin ?? '' })
                : t('pairing.confirm'),
            backdropDismiss: false,
            buttons: [
              { text: t('common.cancel'), role: 'cancel', handler: (): void => respond(false) },
              { text: t('pairing.pair'), handler: (): void => respond(true) },
            ],
          });

    await alert.present();
  }
}
