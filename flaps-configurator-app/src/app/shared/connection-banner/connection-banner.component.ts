import { Component, inject, signal } from '@angular/core';
import { IonButton, IonSpinner, ModalController } from '@ionic/angular';
import { BleLinkService, FoundDevice } from '../../core/ble/ble-link.service';
import { ConnectionService } from '../../core/connection.service';
import { DevicePickerComponent } from '../device-picker/device-picker.component';

/**
 * Baner stanu połączenia: brak połączenia (czerwony), łączenie / ponowne łączenie
 * (pomarańczowy), połączono (zielony).
 */
@Component({
  selector: 'app-connection-banner',
  templateUrl: './connection-banner.component.html',
  styleUrls: ['./connection-banner.component.scss'],
  imports: [IonButton, IonSpinner],
})
export class ConnectionBannerComponent {
  protected readonly connection = inject(ConnectionService);
  private readonly link = inject(BleLinkService);
  private readonly modal = inject(ModalController);

  /** Błąd wyboru urządzenia (np. przeglądarka bez Web Bluetooth). */
  protected readonly pickerError = signal<string | null>(null);

  protected async connect(): Promise<void> {
    this.pickerError.set(null);
    const device = await this.pickDevice();
    if (device) {
      await this.connection.connect(device);
    }
  }

  protected disconnect(): void {
    void this.connection.disconnect();
  }

  private async pickDevice(): Promise<FoundDevice | null> {
    if (this.link.usesBrowserPicker) {
      try {
        return await this.link.requestDeviceInBrowser();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/cancel/i.test(message)) {
          this.pickerError.set(`Nie można wyszukać urządzeń: ${message}`);
        }
        return null;
      }
    }

    const picker = await this.modal.create({ component: DevicePickerComponent });
    await picker.present();
    const { data, role } = await picker.onWillDismiss<FoundDevice>();
    return role === 'select' && data ? data : null;
  }
}
