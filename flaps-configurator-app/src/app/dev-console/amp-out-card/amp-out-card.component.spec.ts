import { Signal, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { create } from '@bufbuild/protobuf';
import { ConfigurationService } from '../../core/configuration.service';
import {
  AmpOutSample,
  DeviceStateService,
  FlapMove,
  FlapMoveMark,
} from '../../core/device-state.service';
import {
  Configuration,
  ConfigurationSchema,
  FlapPosition,
  FlapStopMode,
  FlapStopReason,
} from '../../core/protocol/gen/flaps_pb';
import { AmpOutCardComponent } from './amp-out-card.component';
import { CHART_MARGIN, ChartSize } from './amp-out-chart';
import { AmpOutRange } from './amp-out-range';

describe('AmpOutCardComponent', () => {
  let fixture: ComponentFixture<AmpOutCardComponent>;
  const moves = signal<FlapMove[]>([]);
  const ampOut = signal<AmpOutSample[]>([]);
  const moveMarks = signal<FlapMoveMark[]>([]);
  const device = signal<Configuration | null>(null);
  const clearAmpOut = vi.fn();
  const clearMoves = vi.fn();

  const text = (): string => fixture.nativeElement.textContent;

  beforeEach(() => {
    vi.clearAllMocks();
    moves.set([
      {
        id: 1,
        time: '12:00:01',
        flap: 1,
        position: FlapPosition.OPEN,
        durationMs: 250,
        peakAmpOut: 65535,
        ampOutAtStop: 32768,
        stopReason: FlapStopReason.TIMEOUT,
      },
    ]);
    ampOut.set([]);
    device.set(create(ConfigurationSchema, { devMode: true, readAmpOut: true }));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DeviceStateService,
          useValue: { moves, ampOut, moveMarks, clearAmpOut, clearMoves },
        },
        { provide: ConfigurationService, useValue: { device } },
      ],
    });
    fixture = TestBed.createComponent(AmpOutCardComponent);
    fixture.detectChanges();
  });

  it('lists moves with raw AMP_OUT and voltage', () => {
    expect(text()).toContain('K1');
    expect(text()).toContain('otwarcie');
    expect(text()).toContain('250 ms');
    expect(text()).toContain('3300.0 mV');
    expect(text()).toContain('1650.0 mV');
    expect(fixture.nativeElement.querySelector('.warn').textContent).toContain('limit czasu');
  });

  it('shows the latest voltage of both flaps', () => {
    ampOut.set([{ uptimeMs: 1000, flap1: 32768, flap2: 0, gap: false }]);
    fixture.detectChanges();

    const legend = fixture.nativeElement.querySelector('app-amp-out-legend').textContent;
    expect(legend).toContain('1650.0 mV');
    expect(legend).toContain('0.0 mV');
  });

  it('asks to enable AMP_OUT in the configuration', () => {
    expect(text()).not.toContain('Odczytu AMP_OUT na żywo');

    device.set(create(ConfigurationSchema, { devMode: true, readAmpOut: false }));
    fixture.detectChanges();
    expect(text()).toContain('Odczytu AMP_OUT na żywo');
  });

  it('draws the end stop threshold in the end stop mode', () => {
    ampOut.set([{ uptimeMs: 1000, flap1: 30_000, flap2: 0, gap: false }]);
    const card = fixture.componentInstance as unknown as CardApi;
    card.size.set({ width: 554, height: 220 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.threshold')).toBeNull();

    device.set(
      create(ConfigurationSchema, {
        devMode: true,
        readAmpOut: true,
        stopMode: FlapStopMode.END_STOP,
        endStop: { threshold: 12_000 },
      }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.threshold').textContent).toContain('próg 12000');
  });

  describe('history and selection', () => {
    // 20 s próbek co 20 ms; obszar wykresu 500 px, okno 5 s -> 10 ms na px
    const PLOT_WIDTH = 500;
    let card: CardApi;

    const pointer = (clientX: number, shiftKey = false): PointerEvent =>
      ({
        button: 0,
        pointerId: 1,
        clientX,
        shiftKey,
        currentTarget: fixture.nativeElement,
      }) as unknown as PointerEvent;
    /** x w px dla czasu sterownika przy prawej krawędzi `endMs`. */
    const xAt = (t: number, endMs: number): number => CHART_MARGIN.left + (t - (endMs - 5000)) / 10;
    const drag = (fromX: number, toX: number, shiftKey = false): void => {
      card.onPointerDown(pointer(fromX, shiftKey));
      card.onPointerMove(pointer(toX, shiftKey));
      card.onPointerUp(pointer(toX, shiftKey));
      fixture.detectChanges();
    };

    beforeEach(() => {
      ampOut.set(
        Array.from({ length: 1001 }, (_, i) => ({
          uptimeMs: i * 20,
          flap1: i,
          flap2: 0,
          gap: false,
        })),
      );
      card = fixture.componentInstance as unknown as CardApi;
      card.size.set({
        width: PLOT_WIDTH + CHART_MARGIN.left + CHART_MARGIN.right,
        height: 220,
      });
      fixture.detectChanges();
    });

    it('scrolls back by dragging and returns to live data', () => {
      drag(300, 400); // 100 px w prawo = 1 s wcześniej
      expect(card.viewEnd()).toBe(19_000);
      expect(card.live()).toBe(false);

      drag(100, 2000); // dalej niż historia — zatrzymuje się na początku
      expect(card.viewEnd()).toBe(5000);

      card.goLive();
      expect(card.viewEnd()).toBeNull();
    });

    it('pauses the live chart and resumes it with one button', () => {
      const button = (): HTMLElement => fixture.nativeElement.querySelector('.live-toggle');
      expect(button().textContent).toContain('Pauza');

      button().click();
      fixture.detectChanges();
      expect(card.viewEnd()).toBe(20_000);
      expect(button().textContent).toContain('Na żywo');

      // Nowe dane nie przesuwają zatrzymanego wykresu
      ampOut.update((samples) => [
        ...samples,
        { uptimeMs: 20_020, flap1: 0, flap2: 0, gap: false },
      ]);
      fixture.detectChanges();
      expect(card.viewEnd()).toBe(20_000);

      button().click();
      fixture.detectChanges();
      expect(card.viewEnd()).toBeNull();
      expect(button().textContent).toContain('Pauza');
    });

    it('selects a range with shift and shows its samples', () => {
      drag(xAt(17_500, 20_000), xAt(18_500, 20_000), true);

      expect(card.selection()).toEqual({ fromMs: 17_500, toMs: 18_500 });
      const panel = fixture.nativeElement.querySelector('app-amp-out-selection').textContent;
      expect(panel).toContain('1,00 s · 51 próbek');
      // Przewijanie nie rusza zaznaczenia
      expect(card.viewEnd()).toBeNull();
    });

    it('selects in select mode and clears the selection with a tap', () => {
      card.selectMode.set(true);
      drag(xAt(16_000, 20_000), xAt(15_000, 20_000));
      expect(card.selection()).toEqual({ fromMs: 15_000, toMs: 16_000 });

      drag(200, 200);
      expect(card.selection()).toBeNull();
    });

    it('clears the history, the moves and the selection', () => {
      drag(xAt(17_500, 20_000), xAt(18_500, 20_000), true);
      card.clear();

      expect(card.selection()).toBeNull();
      expect(clearAmpOut).toHaveBeenCalled();
      expect(clearMoves).toHaveBeenCalled();
    });
  });
});

// Dostęp do chronionych składowych karty na potrzeby testu
interface CardApi {
  size: WritableSignal<ChartSize>;
  viewEnd: Signal<number | null>;
  live: Signal<boolean>;
  selectMode: WritableSignal<boolean>;
  selection: Signal<AmpOutRange | null>;
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
  goLive(): void;
  clear(): void;
}
