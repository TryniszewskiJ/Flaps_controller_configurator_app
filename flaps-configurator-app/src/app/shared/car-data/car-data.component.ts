import { Component, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SignalView } from '../device-state-format';

/**
 * Sygnały (dane z auta) jako kafelki: duża wartość, nazwa pod nią; nieaktualne wyszarzone.
 * Wspólne: dashboard użytkownika („Dane z auta”) i technika („Stan zmiennych”).
 */
@Component({
  selector: 'app-car-data',
  templateUrl: './car-data.component.html',
  styleUrls: ['./car-data.component.scss'],
  imports: [TranslatePipe],
})
export class CarDataComponent {
  readonly signals = input.required<readonly SignalView[]>();
}
