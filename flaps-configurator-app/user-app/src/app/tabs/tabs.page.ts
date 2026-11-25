import { Component, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cloudUploadOutline,
  optionsOutline,
  settingsOutline,
  speedometerOutline,
} from 'ionicons/icons';
import { ConnectionService } from '@flaps/core/connection.service';
import { TranslatePipe } from '@flaps/core/i18n/translate.pipe';

@Component({
  selector: 'app-user-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, TranslatePipe],
})
export class UserTabsPage {
  constructor() {
    addIcons({ speedometerOutline, optionsOutline, cloudUploadOutline, settingsOutline });

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
