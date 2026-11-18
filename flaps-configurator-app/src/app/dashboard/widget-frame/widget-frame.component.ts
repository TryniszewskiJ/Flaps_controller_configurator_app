import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowDown, arrowUp, trashOutline } from 'ionicons/icons';

/** Sekcja Dashboardu; w trybie edycji z paskiem: tytuł, w górę / w dół, usuń. */
@Component({
  selector: 'app-widget-frame',
  templateUrl: './widget-frame.component.html',
  styleUrls: ['./widget-frame.component.scss'],
  imports: [IonIcon],
  host: { '[class.editing]': 'editing()' },
})
export class WidgetFrameComponent {
  readonly title = input.required<string>();
  readonly editing = input(false);
  readonly first = input(false);
  readonly last = input(false);

  readonly moved = output<number>();
  readonly removed = output<void>();

  constructor() {
    addIcons({ arrowUp, arrowDown, trashOutline });
  }
}
