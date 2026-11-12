import { Component, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cloudUploadOutline,
  gridOutline,
  optionsOutline,
  pulseOutline,
  terminalOutline,
} from 'ionicons/icons';
import { ConnectionService } from '../core/connection.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage {
  constructor() {
    addIcons({ gridOutline, optionsOutline, pulseOutline, terminalOutline, cloudUploadOutline });

    // Bootloader (tryb ratunkowy) obsługuje tylko aktualizację — od razu do niej
    const connection = inject(ConnectionService);
    const router = inject(Router);
    effect(() => {
      if (connection.connected() && connection.inBootloader()) {
        untracked(() => void router.navigateByUrl('/update'));
      }
    });
  }
}
