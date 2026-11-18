import { Component, inject } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { moonOutline, sunnyOutline } from 'ionicons/icons';
import { ThemeService } from '../../core/theme.service';

/** Przycisk paska: przełącza jasny / ciemny motyw (ikona pokazuje, na co przełączy). */
@Component({
  selector: 'app-theme-toggle',
  template: `
    <ion-button
      class="icon-btn"
      fill="outline"
      color="medium"
      [attr.aria-label]="theme.dark() ? 'Jasny motyw' : 'Ciemny motyw'"
      (click)="theme.toggle()"
    >
      <ion-icon
        slot="icon-only"
        [name]="theme.dark() ? 'sunny-outline' : 'moon-outline'"
      ></ion-icon>
    </ion-button>
  `,
  imports: [IonButton, IonIcon],
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);

  constructor() {
    addIcons({ moonOutline, sunnyOutline });
  }
}
