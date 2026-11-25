import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { create } from '@bufbuild/protobuf';
import { ConnectionService, ConnectionStatus } from '@flaps/core/connection.service';
import { DeviceStateService } from '@flaps/core/device-state.service';
import { FlapsState } from '@flaps/core/protocol/gen/flaps_common_pb';
import {
  DeviceState,
  DeviceStateSchema,
  FlapPosition,
} from '@flaps/core/protocol/gen/flaps_state_pb';
import { setCurrentLanguage } from '@flaps/core/i18n/i18n';
import { LogicsService } from '../core/logics.service';
import { UserDashboardPage } from './dashboard.page';

describe('UserDashboardPage', () => {
  let fixture: ComponentFixture<UserDashboardPage>;
  const status = signal<ConnectionStatus>('connected');
  const state = signal<DeviceState | null>(null);
  const overrideUntil = signal<number | null>(null);
  const setOverride = vi.fn((_state: FlapsState, _duration: unknown) => Promise.resolve());
  const releaseOverride = vi.fn(() => Promise.resolve());

  const text = (): string => fixture.nativeElement.textContent;
  const option = (label: string): HTMLButtonElement =>
    Array.from(
      fixture.nativeElement.querySelectorAll('.mode__option') as NodeListOf<HTMLButtonElement>,
    ).find((el) => el.querySelector('.mode__label')!.textContent!.trim() === label)!;
  /** Zaznaczony tryb przełącznika. */
  const selected = (): string | undefined =>
    (
      fixture.nativeElement.querySelector(
        '[aria-checked="true"] .mode__label',
      ) as HTMLElement | null
    )?.textContent?.trim();
  const durationSelect = (): HTMLElement & { value?: string } =>
    fixture.nativeElement.querySelector('.duration__select');
  const setState = (patch: Partial<DeviceState>): void => {
    state.set(create(DeviceStateSchema, { ...state()!, ...patch }));
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    status.set('connected');
    overrideUntil.set(null);
    state.set(
      create(DeviceStateSchema, {
        signals: [
          { index: 0, value: 3125.5, fresh: true },
          { index: 1, value: 1, fresh: false },
        ],
        activeLogic: 1,
        flap1: FlapPosition.CLOSED,
        flap2: FlapPosition.CLOSED,
      }),
    );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ConnectionService,
          useValue: {
            device: signal(null),
            status,
            connected: computed(() => status() === 'connected'),
            inBootloader: signal(false),
            application: computed(() => status() === 'connected'),
            error: signal(null),
            deviceName: signal('DK_flaps_controller'),
            deviceInfo: signal(null),
          },
        },
        {
          provide: LogicsService,
          useValue: {
            names: signal({ logics: ['Standard', 'Sport'], signals: ['RPM', 'Drive mode'] }),
          },
        },
        {
          provide: DeviceStateService,
          useValue: {
            state,
            overrideUntil,
            override: computed(() => {
              const s = state();
              return s && s.overrideState !== FlapsState.UNSPECIFIED ? s.overrideState : null;
            }),
            overridePermanent: computed(() => !!state()?.overridePermanent),
            setOverride,
            releaseOverride,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(UserDashboardPage);
    fixture.detectChanges();
  });

  it('shows the flaps, who controls them and the signals', () => {
    expect(fixture.nativeElement.querySelector('.summary').textContent).toContain('Zamknięte');
    expect(text()).toContain('Steruje tryb: Sport');
    expect(text()).toContain('RPM');
    const tiles = Array.from(
      fixture.nativeElement.querySelectorAll('.tile') as NodeListOf<HTMLElement>,
    );
    expect(tiles.map((tile) => tile.querySelector('.tile__value')!.textContent!.trim())).toEqual([
      '3125.5',
      '1',
    ]);
    // Nieaktualna wartość — wyszarzona, bez dopisku w treści
    expect(tiles.map((tile) => tile.classList.contains('tile--stale'))).toEqual([false, true]);
    expect(tiles[1].getAttribute('aria-label')).toBe('Drive mode: 1 (brak aktualnych danych)');
    expect(text()).not.toContain('brak danych');
  });

  it('shows Auto with the active logic while the logic controls the flaps', () => {
    expect(selected()).toBe('Auto');
    expect(option('Auto').textContent).toContain('Sport');
    expect(fixture.nativeElement.querySelector('.override')).toBeNull();
  });

  it('opens the flaps permanently by default', () => {
    expect(durationSelect().value).toBe('permanent');

    option('Otwarte').click();

    expect(setOverride).toHaveBeenCalledWith(FlapsState.OPEN, 'permanent');
  });

  it('closes the flaps for the chosen time', () => {
    durationSelect().dispatchEvent(new CustomEvent('ionChange', { detail: { value: '300000' } }));
    fixture.detectChanges();

    option('Zamknięte').click();

    expect(setOverride).toHaveBeenCalledWith(FlapsState.CLOSED, 300_000);
    // Wyjaśnienie dopiero pod przyciskiem „i”
    expect(text()).not.toContain('same wrócą na Auto');
    (fixture.nativeElement.querySelector('.info-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(text()).toContain('same wrócą na Auto');
  });

  it('marks the manual mode and gives the control back with Auto', () => {
    setState({ overrideState: FlapsState.OPEN, overridePermanent: true });

    expect(selected()).toBe('Otwarte');
    expect(text()).toContain('Ręcznie — na stałe');

    option('Auto').click();
    expect(releaseOverride).toHaveBeenCalled();
    expect(setOverride).not.toHaveBeenCalled();
  });

  it('does nothing when the chosen mode is already on', () => {
    option('Auto').click();
    setState({ overrideState: FlapsState.CLOSED });
    option('Zamknięte').click();

    expect(releaseOverride).not.toHaveBeenCalled();
    expect(setOverride).not.toHaveBeenCalled();
  });

  it('applies a new duration to the manual control right away', () => {
    setState({ overrideState: FlapsState.CLOSED });

    durationSelect().dispatchEvent(new CustomEvent('ionChange', { detail: { value: '60000' } }));

    expect(setOverride).toHaveBeenCalledWith(FlapsState.CLOSED, 60_000);
  });

  it('shows the request until the device confirms it', async () => {
    let confirm!: () => void;
    setOverride.mockImplementationOnce(() => new Promise<void>((resolve) => (confirm = resolve)));

    option('Otwarte').click();
    fixture.detectChanges();
    expect(option('Otwarte').classList).toContain('mode__option--pending');
    expect(option('Zamknięte').disabled).toBe(true);

    confirm();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(option('Otwarte').classList).not.toContain('mode__option--pending');
  });

  it('shows why the device refused the change', async () => {
    setOverride.mockImplementationOnce(() =>
      Promise.reject(new Error('Urządzenie nie odpowiada.')),
    );

    option('Otwarte').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).toContain('Urządzenie nie odpowiada.');
  });

  it('shows the flaps moving on the chosen mode until they get there', () => {
    setState({
      overrideState: FlapsState.OPEN,
      flap1: FlapPosition.OPENING,
      flap2: FlapPosition.OPENING,
    });

    expect(option('Otwarte').classList).toContain('mode__option--moving');
    expect(option('Otwarte').textContent).toContain('w ruchu…');

    setState({ flap1: FlapPosition.OPEN, flap2: FlapPosition.OPEN });
    expect(option('Otwarte').classList).not.toContain('mode__option--moving');
    expect(option('Otwarte').textContent).toContain('ręcznie');
  });

  it('counts down a timed manual control', () => {
    overrideUntil.set(Date.now() + 90_000);
    setState({ overrideState: FlapsState.CLOSED });

    expect(text()).toMatch(/Auto wróci za 1:\d{2}/);
  });

  it('switches the texts to English right away', () => {
    setCurrentLanguage('en');
    try {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.summary').textContent).toContain('Closed');
      expect(text()).toContain('Controlled by mode: Sport');
      expect(option('Open')).toBeDefined();
      expect(text()).toContain('Car data');
    } finally {
      setCurrentLanguage('pl');
    }
  });

  it('disables the switch without a connection', () => {
    status.set('disconnected');
    state.set(null);
    fixture.detectChanges();

    expect(option('Otwarte').disabled).toBe(true);
    expect(selected()).toBeUndefined();
    expect(text()).toContain('Połącz się ze sterownikiem');
  });
});
