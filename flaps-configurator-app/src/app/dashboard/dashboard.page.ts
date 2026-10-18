import { Component, inject, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add } from 'ionicons/icons';
import { ConnectionService } from '../core/connection.service';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';

interface VariableState {
  name: string;
  value: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
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
export class DashboardPage {
  protected readonly connected = inject(ConnectionService).connected;

  // Dane zastępcze — do podmiany na odczyty ze sterownika
  protected readonly driveMode = '[wybrany tryb]';
  protected readonly variables: VariableState[] = [
    { name: '[zmienna_1]', value: '[wartość]' },
    { name: '[zmienna_2]', value: '[wartość]' },
    { name: '[stan_1]', value: '[wartość]' },
  ];

  // Mock stanu klap — do podmiany na stan ze sterownika
  protected readonly flapsOpen = signal(false);

  constructor() {
    addIcons({ add });
  }

  protected toggleFlaps(): void {
    this.flapsOpen.update((open) => !open);
  }
}
