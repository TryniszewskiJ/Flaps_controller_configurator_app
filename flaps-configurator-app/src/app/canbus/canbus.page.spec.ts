import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CanSniffService, LatestFrame, SniffedFrame } from '../core/can-sniff.service';
import { ConnectionService } from '../core/connection.service';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';
import { CanbusPage } from './canbus.page';

describe('CanbusPage', () => {
  let fixture: ComponentFixture<CanbusPage>;
  const active = signal(false);
  const history = signal<SniffedFrame[]>([]);
  const latest = signal<LatestFrame[]>([]);
  const start = vi.fn(() => Promise.resolve());
  const stop = vi.fn(() => Promise.resolve());

  const el = (): HTMLElement => fixture.nativeElement;
  /** Przycisk paska po ikonie (Ionic przenosi aria-label do środka przycisku). */
  const button = (icon: string): HTMLElement | null =>
    el().querySelector(`ion-icon[name="${icon}"]`)?.closest('ion-button') ?? null;
  const sniffed = (id: number, canId: number, data: number[]): SniffedFrame => ({
    id,
    timeUs: id * 1000,
    canId,
    extendedId: false,
    data: new Uint8Array(data),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    active.set(false);
    history.set([]);
    latest.set([]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CanSniffService,
          useValue: {
            active,
            history,
            latest,
            start,
            stop,
            busy: signal(false),
            received: signal(0),
            dropped: signal(0),
            summary: signal(null),
            error: signal(null),
            supported: signal(true),
          },
        },
        { provide: ConnectionService, useValue: { application: signal(true) } },
      ],
    });
    // Baner połączenia ma własne testy
    TestBed.overrideComponent(CanbusPage, {
      remove: { imports: [ConnectionBannerComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    fixture = TestBed.createComponent(CanbusPage);
    fixture.detectChanges();
  });

  it('starts sniffing all frames and shows stop while active', () => {
    button('play')!.click();
    expect(start).toHaveBeenCalledWith(true);

    active.set(true);
    fixture.detectChanges();
    expect(button('play')).toBeNull();
    button('stop')!.click();
    expect(stop).toHaveBeenCalled();
    expect(button('pause')).toBeNull();
  });

  it('lists the frame history', () => {
    history.set([sniffed(1, 0x180, [0x0a, 0xff]), sniffed(2, 0x56c, [])]);
    fixture.detectChanges();

    const rows = el().querySelectorAll('.frames .row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('0x180');
    expect(rows[0].textContent).toContain('0A FF');
  });

  it('shows only the latest frame of each ID with the changed bytes', () => {
    history.set([sniffed(1, 0x180, [1, 2])]);
    latest.set([
      {
        key: 's384',
        frame: sniffed(3, 0x180, [1, 3]),
        count: 3,
        periodUs: 10_000,
        changed: [false, true],
      },
    ]);
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { onView(v: string): void }).onView('latest');
    fixture.detectChanges();

    const row = el().querySelectorAll('.frames .row')[1];
    expect(row.textContent).toContain('10.0 ms');
    expect(row.querySelector('.byte--changed')?.textContent).toBe('03');
  });
});
