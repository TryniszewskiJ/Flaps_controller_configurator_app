import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { AutoConnectService } from './core/auto-connect.service';
import { BleLinkService } from './core/ble/ble-link.service';
import { DesktopBluetoothService } from './core/ble/desktop-bluetooth.service';
import { I18nService } from './core/i18n/i18n.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    // Aplikacja desktopowa: okno parowania z kluczem (poza Electronem nic nie robi)
    inject(DesktopBluetoothService).start();
    // Web / Electron: Bluetooth gotowy przed pierwszym „Połącz” (na telefonie nic nie robi)
    inject(BleLinkService).warmUp();
    // Jasny / ciemny motyw od pierwszego ekranu
    inject(ThemeService);
    // Język interfejsu; w aplikacji użytkownika przy pierwszym starcie okno wyboru
    void inject(I18nService).promptIfNeeded();
    // Ostatni sterownik: zapamiętywanie i łączenie przy starcie (ustawienie aplikacji)
    inject(AutoConnectService).start();
  }
}
