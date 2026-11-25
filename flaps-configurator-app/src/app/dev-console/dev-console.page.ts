import { Component } from '@angular/core';
import { IonContent, IonHeader, IonToolbar } from '@ionic/angular';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';
import { AmpOutCardComponent } from './amp-out-card/amp-out-card.component';
import { CommandCardComponent } from './command-card/command-card.component';
import { DeviceLogCardComponent } from './device-log-card/device-log-card.component';
import { FrameLogCardComponent } from './frame-log-card/frame-log-card.component';

/** Narzędzia deweloperskie: komenda, AMP_OUT, logi sterownika i ramki BLE (też na Dashboard). */
@Component({
  selector: 'app-dev-console',
  templateUrl: './dev-console.page.html',
  styleUrls: ['./dev-console.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonContent,
    ConnectionBannerComponent,
    CommandCardComponent,
    AmpOutCardComponent,
    DeviceLogCardComponent,
    FrameLogCardComponent,
  ],
})
export class DevConsolePage {}
