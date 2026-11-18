import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { IonButton, IonIcon, IonRange, IonSegment, IonSegmentButton } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDown } from 'ionicons/icons';
import { AMP_OUT_VREF_MV, ampOutMillivolts, formatAmpOutMillivolts } from '../../core/amp-out';
import {
  ConfigurationService,
  endStopSettings,
  stopModeOf,
} from '../../core/configuration.service';
import { DeviceStateService } from '../../core/device-state.service';
import { FlapStopMode } from '../../core/protocol/gen/flaps_pb';
import { CHART_MARGIN, ChartSize, buildChart, nearestSample } from './amp-out-chart';
import { AmpOutLegendComponent } from './amp-out-legend.component';
import { AmpOutRange } from './amp-out-range';
import { AmpOutSelectionComponent } from './amp-out-selection.component';
import { FlapMovesTableComponent } from './flap-moves-table.component';

const WINDOWS_MS = [2_000, 5_000, 10_000, 30_000];
const CHART_HEIGHT = 220;
/** Przesunięcie poniżej tylu px to stuknięcie, nie przeciągnięcie. */
const DRAG_THRESHOLD_PX = 4;

/** Karta może być naraz w Dev console i na Dashboard — id w SVG muszą się różnić. */
let nextClipId = 0;

interface Drag {
  pointerId: number;
  startX: number;
  /** Przewijanie albo zaznaczanie (tryb „Zaznacz” albo Shift). */
  mode: 'pan' | 'select';
  /** Prawa krawędź widoku na początku przewijania. */
  startEndMs: number;
  /** Czas pod palcem na początku zaznaczania. */
  startMs: number;
  moved: boolean;
}

/**
 * AMP_OUT na żywo (tryb dev z read_amp_out): wykres napięcia linii pomiaru (mV) obu klap ze
 * startami ruchów — przewijany w historii, z zaznaczaniem fragmentu do tabeli, schowka i pliku.
 * Pod nim ruchy klap z EVENT flap_move_finished (zawsze) — do strojenia progu ogranicznika.
 */
@Component({
  selector: 'app-amp-out-card',
  templateUrl: './amp-out-card.component.html',
  styleUrls: ['./amp-out-card.component.scss'],
  imports: [
    IonButton,
    IonIcon,
    IonRange,
    IonSegment,
    IonSegmentButton,
    AmpOutLegendComponent,
    AmpOutSelectionComponent,
    FlapMovesTableComponent,
  ],
})
export class AmpOutCardComponent {
  private readonly deviceState = inject(DeviceStateService);
  private readonly configuration = inject(ConfigurationService);

  protected readonly open = signal(true);
  protected readonly windowMs = signal(5_000);
  /** null = skala automatyczna, liczba = stała 0–VREF [mV]. */
  protected readonly yMax = signal<number | null>(null);
  protected readonly showFlap1 = signal(true);
  protected readonly showFlap2 = signal(true);
  /** Prawa krawędź widoku (czas sterownika); null = na żywo, za najnowszą próbką. */
  protected readonly viewEnd = signal<number | null>(null);
  /** Przeciąganie zaznacza zamiast przewijać. */
  protected readonly selectMode = signal(false);
  protected readonly selection = signal<AmpOutRange | null>(null);
  /** Kursor nad wykresem (px od lewej krawędzi SVG). */
  protected readonly pointerX = signal<number | null>(null);

  protected readonly windows = WINDOWS_MS;
  protected readonly vref = AMP_OUT_VREF_MV;
  protected readonly margin = CHART_MARGIN;
  protected readonly height = CHART_HEIGHT;
  protected readonly plotBottom = CHART_HEIGHT - CHART_MARGIN.bottom;
  protected readonly clipId = `amp-out-plot-${nextClipId++}`;
  protected readonly moves = this.deviceState.moves;
  protected readonly samples = this.deviceState.ampOut;
  protected readonly marks = this.deviceState.moveMarks;

  private readonly size = signal<ChartSize>({ width: 0, height: CHART_HEIGHT });
  private readonly plot = viewChild<ElementRef<HTMLElement>>('plot');
  private drag: Drag | null = null;

  protected readonly width = computed(() => this.size().width);
  private readonly plotWidth = computed(() =>
    Math.max(1, this.size().width - CHART_MARGIN.left - CHART_MARGIN.right),
  );

  /** AMP_OUT włączone w konfiguracji sterownika (tryb dev + odczyt AMP_OUT). */
  protected readonly enabled = computed(() => {
    const config = this.configuration.device();
    return !!config?.devMode && !!config.readAmpOut;
  });

  protected readonly latest = computed(() => this.samples().at(-1) ?? null);
  protected readonly live = computed(() => this.viewEnd() === null);

  /** Zakres suwaka: prawa krawędź od (najstarsza próbka + okno) do najnowszej. */
  protected readonly scroll = computed(() => {
    const samples = this.samples();
    const latest = samples.at(-1);
    if (!latest) {
      return null;
    }
    const min = Math.min(samples[0].uptimeMs + this.windowMs(), latest.uptimeMs);
    return { min, max: latest.uptimeMs, value: this.viewEnd() ?? latest.uptimeMs };
  });

  protected readonly chart = computed(() => {
    const scroll = this.scroll();
    const size = this.size();
    if (!scroll || size.width === 0) {
      return null;
    }
    return buildChart(
      this.samples(),
      this.marks(),
      size,
      this.windowMs(),
      scroll.value,
      this.yMax(),
      scroll.max,
    );
  });

  /** Próg ogranicznika z konfiguracji urządzenia (tryb END_STOP), gdy mieści się w skali. */
  protected readonly threshold = computed(() => {
    const config = this.configuration.device();
    const chart = this.chart();
    if (!config || !chart || stopModeOf(config) !== FlapStopMode.END_STOP) {
      return null;
    }
    const raw = endStopSettings(config).threshold;
    const mv = ampOutMillivolts(raw);
    if (mv > chart.yMaxMv) {
      return null;
    }
    const plotHeight = this.plotBottom - CHART_MARGIN.top;
    return { y: this.plotBottom - (mv / chart.yMaxMv) * plotHeight, label: `próg ${raw}` };
  });

  /** Zaznaczenie na wykresie (px, przycięte do obszaru wykresu). */
  protected readonly selectionBox = computed(() => {
    const range = this.selection();
    if (!range || !this.chart()) {
      return null;
    }
    const left = CHART_MARGIN.left;
    const right = left + this.plotWidth();
    const x1 = Math.max(left, this.timeToX(range.fromMs));
    const x2 = Math.min(right, this.timeToX(range.toMs));
    return x2 > x1 ? { x: x1, width: Math.max(1, x2 - x1) } : null;
  });

  /** Wartości pod kursorem. */
  protected readonly cursor = computed(() => {
    const px = this.pointerX();
    const chart = this.chart();
    if (px === null || !chart) {
      return null;
    }
    const sample = nearestSample(this.samples(), this.xToTime(px));
    if (!sample || sample.uptimeMs < chart.endMs - chart.windowMs) {
      return null;
    }
    const x = this.timeToX(sample.uptimeMs);
    // Czas względem najnowszej próbki, jak na osi
    const ago = sample.uptimeMs - (this.latest()?.uptimeMs ?? chart.endMs);
    return {
      x,
      left: x > this.size().width / 2,
      time: `${(ago / 1000).toFixed(2).replace('-', '−').replace('.', ',')} s`,
      flap1: sample.flap1,
      flap2: sample.flap2,
    };
  });

  constructor() {
    addIcons({ chevronDown });

    // Szerokość wykresu w px — tekst osi nie skaluje się razem z viewBox
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.measure());
      inject(DestroyRef).onDestroy(() => observer.disconnect());
      effect(() => {
        const el = this.plot()?.nativeElement;
        observer.disconnect();
        if (el) {
          observer.observe(el);
        }
      });
    }
  }

  protected setWindow(value: unknown): void {
    this.windowMs.set(Number(value) || 5_000);
    this.scrollTo(this.viewEnd());
  }

  protected setScale(value: unknown): void {
    this.yMax.set(value === 'fixed' ? AMP_OUT_VREF_MV : null);
  }

  protected goLive(): void {
    this.viewEnd.set(null);
  }

  /** Na żywo: zatrzymuje przesuwanie na najnowszej próbce (dane dalej się zbierają). */
  protected toggleLive(): void {
    const latest = this.latest();
    if (this.live() && latest) {
      this.viewEnd.set(latest.uptimeMs);
    } else {
      this.goLive();
    }
  }

  protected onScroll(value: unknown): void {
    if (typeof value === 'number') {
      this.scrollTo(value);
    }
  }

  protected clear(): void {
    this.viewEnd.set(null);
    this.selection.set(null);
    this.pointerX.set(null);
    this.deviceState.clearAmpOut();
    this.deviceState.clearMoves();
  }

  protected onPointerDown(event: PointerEvent): void {
    const chart = this.chart();
    if (!chart || event.button !== 0) {
      return;
    }
    const x = this.localX(event);
    this.drag = {
      pointerId: event.pointerId,
      startX: x,
      mode: this.selectMode() || event.shiftKey ? 'select' : 'pan',
      startEndMs: chart.endMs,
      startMs: this.xToTime(x),
      moved: false,
    };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.pointerX.set(x);
  }

  protected onPointerMove(event: PointerEvent): void {
    const x = this.localX(event);
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      this.pointerX.set(x);
      return;
    }
    if (!drag.moved && Math.abs(x - drag.startX) < DRAG_THRESHOLD_PX) {
      return;
    }
    drag.moved = true;
    if (drag.mode === 'pan') {
      // Przeciągnięcie w prawo pokazuje starsze dane
      const deltaMs = ((x - drag.startX) / this.plotWidth()) * this.windowMs();
      this.scrollTo(drag.startEndMs - deltaMs);
      this.pointerX.set(null);
    } else {
      const t = this.xToTime(x);
      this.selection.set({ fromMs: Math.min(drag.startMs, t), toMs: Math.max(drag.startMs, t) });
      this.pointerX.set(x);
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    this.drag = null;
    // Stuknięcie w trybie zaznaczania usuwa zaznaczenie
    if (!drag.moved && drag.mode === 'select') {
      this.selection.set(null);
    }
  }

  protected onPointerLeave(): void {
    if (!this.drag) {
      this.pointerX.set(null);
    }
  }

  /** Gładzik (przesunięcie w bok) albo Shift + kółko przewija w czasie. */
  protected onWheel(event: WheelEvent): void {
    const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = sideways ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    const chart = this.chart();
    if (delta === 0 || !chart) {
      return;
    }
    event.preventDefault();
    this.scrollTo(chart.endMs + (delta / this.plotWidth()) * this.windowMs());
  }

  protected windowLabel(ms: number): string {
    return `${ms / 1000} s`;
  }

  protected millivolts(raw: number): string {
    return formatAmpOutMillivolts(raw);
  }

  /** Prawa krawędź widoku w granicach historii; za najnowszą próbką = na żywo. */
  private scrollTo(endMs: number | null): void {
    const scroll = this.scroll();
    if (endMs === null || !scroll || endMs >= scroll.max) {
      this.viewEnd.set(null);
      return;
    }
    this.viewEnd.set(Math.max(scroll.min, endMs));
  }

  private xToTime(x: number): number {
    const chart = this.chart();
    if (!chart) {
      return 0;
    }
    const start = chart.endMs - chart.windowMs;
    return start + ((x - CHART_MARGIN.left) / this.plotWidth()) * chart.windowMs;
  }

  private timeToX(t: number): number {
    const chart = this.chart();
    if (!chart) {
      return 0;
    }
    const start = chart.endMs - chart.windowMs;
    return CHART_MARGIN.left + ((t - start) / chart.windowMs) * this.plotWidth();
  }

  private localX(event: PointerEvent): number {
    return event.clientX - (event.currentTarget as Element).getBoundingClientRect().left;
  }

  private measure(): void {
    const width = Math.floor(this.plot()?.nativeElement.clientWidth ?? 0);
    if (width !== this.size().width) {
      this.size.set({ width, height: CHART_HEIGHT });
    }
  }
}
