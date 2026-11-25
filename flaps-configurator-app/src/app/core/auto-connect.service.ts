import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BleLinkService } from './ble/ble-link.service';
import { DesktopBluetoothService } from './ble/desktop-bluetooth.service';
import { ConnectionService } from './connection.service';
import { RememberedDevice, SettingsService } from './settings.service';
import { t } from './i18n/i18n';

/** Komputer: tyle czekamy, aż zapamiętany sterownik pojawi się w skanowaniu. */
export const AUTO_CONNECT_SEARCH_MS = 10_000;

/**
 * Ostatni sterownik i łączenie z nim przy starcie aplikacji (ustawienie „Łącz automatycznie”).
 * Działa na telefonie (połączenie po adresie / UUID Bluetooth) i w aplikacji desktopowej
 * (Electron wybiera urządzenie sam). W przeglądarce nie — Web Bluetooth zawsze pokazuje
 * okno wyboru urządzenia.
 */
@Injectable({ providedIn: 'root' })
export class AutoConnectService {
  private readonly connection = inject(ConnectionService);
  private readonly settings = inject(SettingsService);
  private readonly link = inject(BleLinkService);
  private readonly desktop = inject(DesktopBluetoothService);

  /** Czy na tej platformie da się połączyć bez wybierania urządzenia. */
  readonly supported = Capacitor.isNativePlatform() || this.desktop.available;

  private readonly _searching = signal<RememberedDevice | null>(null);
  private readonly _error = signal<string | null>(null);
  /** Komputer: szukanie zapamiętanego sterownika (przed połączeniem BLE). */
  readonly searching = this._searching.asReadonly();
  /** Nie znaleziono zapamiętanego sterownika. */
  readonly error = this._error.asReadonly();

  private started = false;

  constructor() {
    // Każde udane połączenie zapamiętuje sterownik (nazwa i UID z GET_DEVICE_INFO)
    effect(() => {
      const device = this.connection.device();
      const info = this.connection.deviceInfo();
      if (this.connection.status() !== 'connected' || !device || !info) {
        return;
      }
      untracked(() => this.remember(device.deviceId, device.name, info.uid));
    });
    // Ręczne „Połącz” albo udane połączenie — komunikat o nieznalezionym sterowniku jest nieaktualny
    effect(() => {
      if (this.connection.status() !== 'disconnected') {
        untracked(() => this._error.set(null));
      }
    });
  }

  /** Raz, przy starcie aplikacji: łączy z ostatnim sterownikiem, jeśli to włączone. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const device = this.settings.lastDevice();
    if (this.supported && this.settings.autoConnect() && device) {
      void this.connectTo(device);
    }
  }

  /** Przerywa szukanie sterownika (komputer); łączenie przerywa ConnectionService.disconnect(). */
  cancel(): void {
    if (this._searching()) {
      this._searching.set(null);
      this.desktop.cancelSelection();
    }
  }

  private async connectTo(device: RememberedDevice): Promise<void> {
    if (this.connection.status() !== 'disconnected') {
      return;
    }
    this._error.set(null);

    if (!this.desktop.available) {
      await this.connection.connect({ deviceId: device.deviceId, name: device.name });
      return;
    }

    // Electron: requestDevice() wybierze zapamiętane urządzenie, gdy pojawi się w skanowaniu
    this._searching.set(device);
    const timer = setTimeout(() => this.desktop.cancelSelection(), AUTO_CONNECT_SEARCH_MS);
    try {
      await this.link.prepare();
      await this.desktop.autoSelect(device.deviceId);
      const found = await this.link.requestDeviceInBrowser();
      if (!this._searching()) {
        return; // przerwane przez cancel()
      }
      this._searching.set(null);
      await this.connection.connect({ ...found, name: found.name || device.name });
    } catch {
      if (this._searching()) {
        this._error.set(t('autoConnect.notFound', { name: device.name }));
      }
      this._searching.set(null);
    } finally {
      clearTimeout(timer);
    }
  }

  private remember(deviceId: string, name: string, uid: string): void {
    if (!this.supported) {
      return; // w przeglądarce identyfikator nie nadaje się do ponownego połączenia
    }
    // Electron: deviceId z Web Bluetooth jest losowy — zapamiętujemy ten z okna wyboru
    const id = this.desktop.available ? this.desktop.selectedId : deviceId;
    if (id) {
      this.settings.rememberDevice({ deviceId: id, name, uid });
    }
  }
}
