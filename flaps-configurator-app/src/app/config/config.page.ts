import { Component, inject } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { downloadOutline } from 'ionicons/icons';
import { ConnectionService } from '../core/connection.service';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';

interface VariableDefinition {
  name: string;
  kind: 'zmienna' | 'stan';
}

interface RuleLine {
  keyword: string;
  expression: string;
}

@Component({
  selector: 'app-config',
  templateUrl: './config.page.html',
  styleUrls: ['./config.page.scss'],
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
export class ConfigPage {
  protected readonly connected = inject(ConnectionService).connected;

  // Dane zastępcze — do podmiany na konfigurację odczytaną ze sterownika
  protected readonly variables: VariableDefinition[] = [
    { name: '[zmienna_1]', kind: 'zmienna' },
    { name: '[zmienna_2]', kind: 'zmienna' },
    { name: '[tryb_jazdy]', kind: 'stan' },
  ];

  protected readonly rule: RuleLine[] = [
    { keyword: 'JEŻELI', expression: '[ramka/zmienna] = [wartość]' },
    { keyword: 'I', expression: '[zmienna_2] > [próg]' },
    { keyword: 'TO', expression: '[tryb_jazdy] := [stan]' },
  ];

  constructor() {
    addIcons({ downloadOutline });
  }
}
