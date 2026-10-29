import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { DesktopBluetoothService } from './core/ble/desktop-bluetooth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    // Aplikacja desktopowa: okno parowania z kluczem (poza Electronem nic nie robi)
    inject(DesktopBluetoothService).start();
  }
}
