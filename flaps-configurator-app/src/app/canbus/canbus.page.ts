import { Component, inject } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, pause, play, pulseOutline } from 'ionicons/icons';
import { ConnectionService } from '../core/connection.service';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';

@Component({
  selector: 'app-canbus',
  templateUrl: './canbus.page.html',
  styleUrls: ['./canbus.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    ConnectionBannerComponent,
  ],
})
export class CanbusPage {
  protected readonly connected = inject(ConnectionService).connected;

  constructor() {
    addIcons({ add, pause, play, pulseOutline });
  }
}
