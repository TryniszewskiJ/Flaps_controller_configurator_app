import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { create } from '@bufbuild/protobuf';
import { ActionSheetController } from '@ionic/angular';
import { ConfigurationService } from '../core/configuration.service';
import { ConnectionService, ConnectionStatus } from '../core/connection.service';
import { DevTelemetryService } from '../core/dev-telemetry.service';
import { DeviceStateService } from '../core/device-state.service';
import {
  ConfigurationSchema,
  DeviceState,
  DeviceStateSchema,
  FlapPosition,
  FlapsState,
} from '../core/protocol/messages';
import { defaultConfiguration } from '../core/testing/fake-device';
import { DashboardLayoutService } from './dashboard-layout.service';
import { DashboardPage } from './dashboard.page';

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;
  const status = signal<ConnectionStatus>('connected');
  const state = signal<DeviceState | null>(null);
  const overrideUntil = signal<number | null>(null);
  const permanentSupported = signal(true);
  const setOverride = vi.fn(() => Promise.resolve());
  const releaseOverride = vi.fn(() => Promise.resolve());
  const device = signal(defaultConfiguration());
  const present = vi.fn(() => Promise.resolve());
  const createSheet = vi.fn((_options: unknown) => Promise.resolve({ present }));

  const text = (): string => fixture.nativeElement.textContent;
  const flapsButton = (): HTMLElement =>
    fixture.nativeElement.querySelector('.override-button') as HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    status.set('connected');
    overrideUntil.set(null);
    permanentSupported.set(true);
    device.set(defaultConfiguration());
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
        { provide: ConfigurationService, useValue: { device } },
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
            permanentOverrideSupported: permanentSupported,
            setOverride,
            releaseOverride,
          },
        },
        {
          provide: DevTelemetryService,
          useValue: { logs: signal([]), droppedLogs: signal(0), clearLogs: vi.fn() },
        },
        { provide: ActionSheetController, useValue: { create: createSheet } },
      ],
    });
    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
  });

  describe('sections', () => {
    const titles = (): string[] =>
      Array.from(
        fixture.nativeElement.querySelectorAll('.card-label') as NodeListOf<HTMLElement>,
        (el) => el.textContent!.trim(),
      );
    const editButton = (): HTMLElement =>
      fixture.nativeElement.querySelector('ion-buttons ion-button') as HTMLElement;
    const frameButton = (index: number, label: string): HTMLElement =>
      fixture.nativeElement
        .querySelectorAll('app-widget-frame')
        [index].querySelector(`[aria-label^="${label}"]`) as HTMLElement;

    it('shows the default sections without edit controls', () => {
      expect(titles()).toEqual(['Tryb jazdy', 'Stan klap', 'Stan zmiennych', 'Akcje']);
      expect(fixture.nativeElement.querySelector('.widget-bar')).toBeNull();
    });

    it('removes and moves sections in edit mode', () => {
      editButton().click();
      fixture.detectChanges();

      frameButton(0, 'Usuń').click();
      fixture.detectChanges();
      frameButton(2, 'Przesuń w górę').click();
      fixture.detectChanges();

      expect(titles()).toEqual(['Stan klap', 'Akcje', 'Stan zmiennych']);
      expect(TestBed.inject(DashboardLayoutService).widgets()).toEqual([
        'flaps',
        'actions',
        'signals',
      ]);
    });

    it('adds a section from the Dev console with the plus button', async () => {
      fixture.nativeElement.querySelector('.btn-add').click();
      await fixture.whenStable();

      const { buttons } = createSheet.mock.calls[0][0] as {
        buttons: { text: string; handler?: () => void }[];
      };
      expect(buttons.map((b) => b.text)).toEqual([
        'Komenda · Dev console',
        'AMP_OUT · Dev console',
        'Logi sterownika · Dev console',
        'Ramki BLE · Dev console',
        'Anuluj',
      ]);
      expect(present).toHaveBeenCalled();

      buttons[2].handler!();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-device-log-card')).not.toBeNull();
      expect(titles().at(-1)).toContain('Logi sterownika');
    });
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

    device.set(
      create(ConfigurationSchema, { ...defaultConfiguration(), demoMode: true, devMode: true }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.demo-banner')?.textContent).toContain('Tryb demo');
  });

  it('shows the active logic, flaps and signals with names from the configuration', () => {
    expect(text()).toContain('Sport');
    expect(text()).toContain('Zamknięta');
    expect(text()).toContain('RPM');
    const tiles = Array.from(
      fixture.nativeElement.querySelectorAll('.tile') as NodeListOf<HTMLElement>,
    );
    expect(tiles.map((tile) => tile.querySelector('.tile__value')!.textContent!.trim())).toEqual([
      '3125.5',
      '1',
    ]);
    expect(tiles.map((tile) => tile.classList.contains('tile--stale'))).toEqual([false, true]);
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

  it('shows a permanent manual control without a countdown', () => {
    state.set(
      create(DeviceStateSchema, { overrideState: FlapsState.CLOSED, overridePermanent: true }),
    );
    fixture.detectChanges();

    expect(text()).toContain('Sterowanie ręczne: zamknięte');
    expect(text()).toContain('Na stałe');
    expect(text()).not.toMatch(/za \d+:\d{2}/);
  });

  it('shows the fail-safe state', () => {
    state.set(create(DeviceStateSchema, { activeLogic: -1 }));
    fixture.detectChanges();

    expect(text()).toContain('Stan bezpieczny');
  });
});
