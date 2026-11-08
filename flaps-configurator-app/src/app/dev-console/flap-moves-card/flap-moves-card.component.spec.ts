import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DeviceStateService, FlapMove } from '../../core/device-state.service';
import { FlapPosition } from '../../core/protocol/gen/flaps_pb';
import { FlapMovesCardComponent } from './flap-moves-card.component';

describe('FlapMovesCardComponent', () => {
  let fixture: ComponentFixture<FlapMovesCardComponent>;
  const moves = signal<FlapMove[]>([]);

  const text = (): string => fixture.nativeElement.textContent;

  beforeEach(() => {
    moves.set([
      {
        id: 1,
        time: '12:00:01',
        flap: 1,
        position: FlapPosition.OPEN,
        durationMs: 250,
        peakAmpOut: 65535,
        ampOutAtStop: 32768,
        trace: { intervalMs: 5, samples: [100, 65535, 30000] },
      },
    ]);
    TestBed.configureTestingModule({
      providers: [{ provide: DeviceStateService, useValue: { moves, clearMoves: vi.fn() } }],
    });
    fixture = TestBed.createComponent(FlapMovesCardComponent);
    fixture.detectChanges();
  });

  it('lists moves with raw AMP_OUT and voltage', () => {
    expect(text()).toContain('K1');
    expect(text()).toContain('otwarcie');
    expect(text()).toContain('250 ms');
    expect(text()).toContain('65535');
    expect(text()).toContain('3.300 V');
    expect(text()).toContain('1.650 V');
  });

  it('shows the trace samples after expanding a move', () => {
    fixture.nativeElement.querySelector('.row-toggle').click();
    fixture.detectChanges();

    const rows = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.trace-table tbody tr'),
    );
    const cells = (row: HTMLElement): string =>
      Array.from(row.querySelectorAll('td'), (td) => td.textContent?.trim()).join(' | ');
    expect(rows.map(cells)).toEqual([
      '0 | 100 | 0.005 V',
      '5 | 65535 | 3.300 V',
      '10 | 30000 | 1.511 V',
    ]);
    expect(rows[1].classList).toContain('trace-peak');
  });
});
