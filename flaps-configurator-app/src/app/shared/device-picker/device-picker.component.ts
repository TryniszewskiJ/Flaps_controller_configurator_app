import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { bluetooth, cellular, close } from 'ionicons/icons';
import { BleLinkService, FoundDevice } from '../../core/ble/ble-link.service';
import { DEFAULT_DEVICE_NAME } from '../../core/connection.service';

const SCAN_DURATION_MS = 15_000;

/**
 * Okno wyboru urządzenia: skanuje tylko urządzenia z serwisem mostka nRF52,
 * zamyka się z wybranym urządzeniem (rola 'select').
 */
@Component({
  selector: 'app-device-picker',
  templateUrl: './device-picker.component.html',
  styleUrls: ['./device-picker.component.scss'],
  imports: [IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonContent, IonSpinner],
})
export class DevicePickerComponent implements OnInit, OnDestroy {
  private readonly modal = inject(ModalController);
  private readonly link = inject(BleLinkService);

  protected readonly devices = signal<FoundDevice[]>([]);
  protected readonly scanning = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly defaultName = DEFAULT_DEVICE_NAME;

  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    addIcons({ bluetooth, cellular, close });
  }

  ngOnInit(): void {
    void this.startScan();
  }

  ngOnDestroy(): void {
    void this.stopScan();
  }

  protected async startScan(): Promise<void> {
    this.devices.set([]);
    this.error.set(null);
    this.scanning.set(true);

    try {
      await this.link.startScan((device) => this.addDevice(device));
      this.scanTimer = setTimeout(() => void this.stopScan(), SCAN_DURATION_MS);
    } catch (error) {
      this.scanning.set(false);
      this.error.set(describeScanError(error));
    }
  }

  protected async select(device: FoundDevice): Promise<void> {
    await this.stopScan();
    await this.modal.dismiss(device, 'select');
  }

  protected async close(): Promise<void> {
    await this.stopScan();
    await this.modal.dismiss(null, 'cancel');
  }

  protected signalLabel(rssi: number | undefined): string {
    return rssi === undefined ? '' : `${rssi} dBm`;
  }

  private async stopScan(): Promise<void> {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.scanning()) {
      this.scanning.set(false);
      await this.link.stopScan().catch(() => undefined);
    }
  }

  /** Nowe urządzenie albo odświeżenie RSSI; najsilniejszy sygnał na górze. */
  private addDevice(device: FoundDevice): void {
    this.devices.update((devices) =>
      [...devices.filter((d) => d.deviceId !== device.deviceId), device].sort(
        (a, b) => (b.rssi ?? -127) - (a.rssi ?? -127),
      ),
    );
  }
}

function describeScanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/permission/i.test(message)) {
    return 'Brak uprawnień do Bluetooth. Zezwól aplikacji na wyszukiwanie urządzeń w pobliżu.';
  }
  if (/enable|disabled/i.test(message)) {
    return 'Bluetooth jest wyłączony. Włącz go i spróbuj ponownie.';
  }
  return `Nie udało się wyszukać urządzeń: ${message}`;
}
