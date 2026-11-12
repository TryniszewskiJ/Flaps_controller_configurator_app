import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { create } from '@bufbuild/protobuf';
import { ConfigurationService } from '../core/configuration.service';
import { ConnectionService, ConnectionStatus } from '../core/connection.service';
import { DeviceStateService } from '../core/device-state.service';
import {
  ConfigurationSchema,
  DeviceState,
  DeviceStateSchema,
  FlapPosition,
  FlapsState,
} from '../core/protocol/gen/flaps_pb';
import { defaultConfiguration } from '../core/testing/fake-device';
import { DashboardPage } from './dashboard.page';

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;
  const status = signal<ConnectionStatus>('connected');
  const state = signal<DeviceState | null>(null);
  const overrideUntil = signal<number | null>(null);
  const setOverride = vi.fn(() => Promise.resolve());
  const releaseOverride = vi.fn(() => Promise.resolve());
  const device = signal(defaultConfiguration());
  const devModeEnabled = signal(false);

  const text = (): string => fixture.nativeElement.textContent;
  const flapsButton = (): HTMLElement =>
    fixture.nativeElement.querySelector('.override-button') as HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    status.set('connected');
    overrideUntil.set(null);
    device.set(defaultConfiguration());
    devModeEnabled.set(false);
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
            status,
            connected: computed(() => status() === 'connected'),
            inBootloader: signal(false),
            application: computed(() => status() === 'connected'),
            error: signal(null),
            deviceName: signal('DK_flaps_controller'),
            deviceInfo: signal(null),
          },
        },
        { provide: ConfigurationService, useValue: { device } },
        {
          provide: DeviceStateService,
          useValue: {
            state,
            overrideUntil,
            devModeEnabled,
            override: computed(() => {
              const s = state();
              return s && s.overrideState !== FlapsState.UNSPECIFIED ? s.overrideState : null;
            }),
            setOverride,
            releaseOverride,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
  });

  it('shows a flap on a disconnected output as not connected', () => {
    state.set(create(DeviceStateSchema, { ...state()!, flap2: FlapPosition.NOT_CONNECTED }));
    fixture.detectChanges();

    expect(text()).toContain('Niepodłączona');
    expect(fixture.nativeElement.querySelector('.flap-state--off')).not.toBeNull();
  });

  it('shows the demo banner only with demo mode configured and dev mode on', () => {
    device.set(create(ConfigurationSchema, { ...defaultConfiguration(), demoMode: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.demo-banner')).toBeNull();

    devModeEnabled.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.demo-banner')?.textContent).toContain('Tryb demo');
  });

  it('shows the active logic, flaps and signals with names from the configuration', () => {
    expect(text()).toContain('Sport');
    expect(text()).toContain('Zamknięta');
    expect(text()).toContain('RPM');
    expect(text()).toContain('3125.5');
    expect(text()).toContain('1 (brak danych)');
  });

  it('opens closed flaps for the chosen time', () => {
    expect(flapsButton().textContent).toContain('Otwórz klapy');

    flapsButton().click();

    expect(setOverride).toHaveBeenCalledWith(FlapsState.OPEN, 5 * 60_000);
  });

  it('closes open flaps', () => {
    state.set(create(DeviceStateSchema, { flap1: FlapPosition.OPEN, flap2: FlapPosition.OPEN }));
    fixture.detectChanges();

    expect(flapsButton().textContent).toContain('Zamknij klapy');
    flapsButton().click();

    expect(setOverride).toHaveBeenCalledWith(FlapsState.CLOSED, 5 * 60_000);
  });

  it('shows the manual control with the remaining time and releases it', () => {
    state.set(create(DeviceStateSchema, { overrideState: FlapsState.OPEN }));
    overrideUntil.set(Date.now() + 90_000);
    fixture.detectChanges();

    expect(text()).toContain('Sterowanie ręczne: otwarte');
    expect(text()).toMatch(/za 1:\d{2}/);

    (fixture.nativeElement.querySelector('.override ion-button') as HTMLElement).click();
    expect(releaseOverride).toHaveBeenCalled();
  });

  it('shows the fail-safe state', () => {
    state.set(create(DeviceStateSchema, { activeLogic: -1 }));
    fixture.detectChanges();

    expect(text()).toContain('Stan bezpieczny');
  });
});
