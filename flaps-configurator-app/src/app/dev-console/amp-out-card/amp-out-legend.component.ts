import { Component, input, model } from '@angular/core';
import { formatAmpOutMillivolts } from '../../core/amp-out';
import { AmpOutSample } from '../../core/device-state.service';

/** Legenda wykresu AMP_OUT: klapy z ostatnim napięciem (klik ukrywa linię) i znaczniki ruchów. */
@Component({
  selector: 'app-amp-out-legend',
  templateUrl: './amp-out-legend.component.html',
  styleUrls: ['./amp-out-legend.component.scss'],
})
export class AmpOutLegendComponent {
  readonly latest = input<AmpOutSample | null>(null);
  readonly showFlap1 = model(true);
  readonly showFlap2 = model(true);

  protected millivolts(raw: number): string {
    return formatAmpOutMillivolts(raw);
  }
}
