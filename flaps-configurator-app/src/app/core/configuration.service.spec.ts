import { TestBed } from '@angular/core/testing';
import { create } from '@bufbuild/protobuf';
import { BleLinkService } from './ble/ble-link.service';
import {
  ConfigurationService,
  configurationSettings,
  endStopSettings,
  flapOutputSettings,
} from './configuration.service';
import { ConnectionService } from './connection.service';
import { DeviceStateService } from './device-state.service';
import {
  CanFrameSchema,
  ConditionNodeType,
  ConfigurationError,
  FlapPosition,
  FlapsState,
  FlapStopMode,
  LogicSchema,
  LogLevel,
  SignalSchema,
  Status,
} from './protocol/messages';
import { FakeBleLink } from './testing/fake-ble-link';

describe('ConfigurationService', () => {
  let service: ConfigurationService;
  let connection: ConnectionService;
  let link: FakeBleLink;

  /** Połączenie i odczyt konfiguracji uruchamiany po nim przez effect. */
  const connect = async (): Promise<void> => {
    await connection.connect({ deviceId: 'AA:BB' });
    TestBed.tick();
    await vi.waitFor(() => expect(service.draft()).not.toBeNull());
  };

  beforeEach(() => {
    link = new FakeBleLink();
    TestBed.configureTestingModule({ providers: [{ provide: BleLinkService, useValue: link }] });
    connection = TestBed.inject(ConnectionService);
    service = TestBed.inject(ConfigurationService);
  });

  it('reads the configuration after connecting', async () => {
    await connect();

    expect(service.draft()?.signals.map((signal) => signal.name)).toEqual(['RPM', 'Drive mode']);
    expect(service.dirty()).toBe(false);
    expect(service.unsavedOnDevice()).toBe(false);
  });

  it('tracks edits until they are applied with SET_CONFIGURATION', async () => {
    await connect();
    const rpm = service.draft()!.signals[0];

    service.setSignal(0, create(SignalSchema, { ...rpm, lengthBits: 12 }));
    expect(service.dirty()).toBe(true);

    expect(await service.apply()).toBe(true);
    expect(link.device.configuration.signals[0].lengthBits).toBe(12);
    expect(service.dirty()).toBe(false);
    expect(service.unsavedOnDevice()).toBe(true);
  });

  it('keeps the draft and explains a rejected configuration', async () => {
    await connect();
    service.setFrame(null, create(CanFrameSchema, { id: 0x180 }));
    link.device.rejectConfiguration = ConfigurationError.DUPLICATE_FRAME;

    expect(await service.apply()).toBe(false);
    expect(service.error()).toContain('dwa razy');
    expect(service.dirty()).toBe(true);
  });

  it('applies pending changes before SAVE_CONFIGURATION', async () => {
    await connect();
    service.setFrame(null, create(CanFrameSchema, { id: 0x200 }));

    expect(await service.save()).toBe(true);
    expect(link.device.configuration.frames.map((frame) => frame.id)).toContain(0x200);
    expect(link.device.unsavedChanges).toBe(false);
    expect(service.unsavedOnDevice()).toBe(false);
  });

  it('reports a flash error', async () => {
    await connect();
    link.device.saveStatus = Status.FLASH_ERROR;

    expect(await service.save()).toBe(false);
    expect(service.error()).toContain('flashu');
  });

  it('does not remove a signal used by the logics', async () => {
    await connect();

    expect(service.removeSignal(1)).toContain('selektor');
    expect(service.draft()?.signals).toHaveLength(2);
  });

  it('shifts signal references after removing a signal', async () => {
    await connect();
    service.setSignal(0, create(SignalSchema, { ...service.draft()!.signals[0], name: 'Unused' }));
    service.setSignal(
      null,
      create(SignalSchema, {
        frameIndex: 0,
        startingBit: 7,
        lengthBits: 16,
        scale: 1,
        name: 'RPM',
      }),
    );
    // logiki → sygnał 2 (nowy RPM), selektor → 1 (Drive mode)
    const draft = service.draft()!;
    draft.logics.forEach((logic) => (logic.inputSignal = 2));

    expect(service.removeSignal(0)).toBeNull();
    expect(service.draft()?.signals.map((signal) => signal.name)).toEqual(['Drive mode', 'RPM']);
    expect(service.draft()?.selectorSignal).toBe(0);
    expect(service.draft()?.logics.map((logic) => logic.inputSignal)).toEqual([1, 1]);
  });

  it('shifts and protects the signals of a condition logic', async () => {
    await connect();
    service.setSettings({ ...configurationSettings(service.draft()!), selectorSignal: undefined });
    service.removeLogic(1);
    service.setLogic(
      0,
      create(LogicSchema, {
        parameters: {
          case: 'condition',
          value: {
            nodes: [{ type: ConditionNodeType.CONDITION_NODE_GREATER, signal: 1, value: 1 }],
          },
        },
      }),
    );

    expect(service.removeSignal(1)).toContain('logika');
    expect(service.removeSignal(0)).toBeNull();
    const logic = service.draft()!.logics[0];
    expect(logic.parameters.case === 'condition' && logic.parameters.value.nodes[0].signal).toBe(0);
  });

  it('does not remove a frame read by a signal', async () => {
    await connect();

    expect(service.removeFrame(0)).toContain('RPM');
    expect(service.draft()?.frames).toHaveLength(2);
  });

  it('adds a logic and sends it with SET_CONFIGURATION', async () => {
    await connect();
    service.setLogic(
      null,
      create(LogicSchema, {
        selectorValue: 2,
        description: 'Track',
        parameters: { case: 'fixed', value: { state: FlapsState.OPEN } },
      }),
    );

    expect(await service.apply()).toBe(true);
    expect(link.device.configuration.logics.map((logic) => logic.description)).toEqual([
      'Standard',
      'Sport',
      'Track',
    ]);
  });

  it('keeps the default logic pointing at the same logic after a removal', async () => {
    await connect();
    service.setSettings({ ...configurationSettings(service.draft()!), defaultLogicIndex: 1 });

    expect(service.removeLogic(0)).toBeNull();
    expect(service.draft()?.logics.map((logic) => logic.description)).toEqual(['Sport']);
    expect(service.draft()?.defaultLogicIndex).toBe(0);
    expect(service.removeLogic(0)).toContain('co najmniej jednej');
  });

  it('changes the general settings', async () => {
    await connect();
    service.setSettings({
      selectorSignal: undefined,
      defaultLogicIndex: 0,
      failSafeState: FlapsState.OPEN,
      stopMode: FlapStopMode.END_STOP,
      moveTimeMs: 400,
      endStop: { threshold: 20_000, blankingMs: 200, timeoutMs: 800 },
      fdcanTermination: true,
      flap1: { connected: true, reversed: true },
      flap2: { connected: false, reversed: false },
      devMode: true,
      logLevel: LogLevel.DEBUG,
      readAmpOut: true,
      demoMode: true,
    });

    const draft = service.draft()!;
    expect(draft.selectorSignal).toBeUndefined();
    expect(draft.failSafeState).toBe(FlapsState.OPEN);
    expect(draft.moveTimeMs).toBe(400);
    expect(draft.stopMode).toBe(FlapStopMode.END_STOP);
    expect(endStopSettings(draft)).toEqual({ threshold: 20_000, blankingMs: 200, timeoutMs: 800 });
    expect(draft.fdcanTermination).toBe(true);
    expect(flapOutputSettings(draft, 1)).toEqual({ connected: true, reversed: true });
    expect(flapOutputSettings(draft, 2)).toEqual({ connected: false, reversed: false });
    expect(draft.devMode).toBe(true);
    expect(draft.logLevel).toBe(LogLevel.DEBUG);
    expect(draft.readAmpOut).toBe(true);
    expect(draft.demoMode).toBe(true);
    expect(service.dirty()).toBe(true);
  });

  it('treats missing flap outputs (device < 1.7) as connected without changes', async () => {
    link.device.configuration.flap1 = undefined;
    link.device.configuration.flap2 = undefined;
    await connect();

    expect(configurationSettings(service.draft()!).flap1).toEqual({
      connected: true,
      reversed: false,
    });
    service.setSettings(configurationSettings(service.draft()!));
    expect(service.dirty()).toBe(false);
  });

  it('treats a missing stop mode and end stop (device < 1.11) as time and defaults', async () => {
    link.device.configuration.stopMode = FlapStopMode.UNSPECIFIED;
    link.device.configuration.endStop = undefined;
    await connect();

    const settings = configurationSettings(service.draft()!);
    expect(settings.stopMode).toBe(FlapStopMode.TIME);
    expect(settings.endStop).toEqual({ threshold: 12_000, blankingMs: 150, timeoutMs: 1000 });
    service.setSettings(settings);
    expect(service.dirty()).toBe(false);
  });

  it('explains a configuration without any connected flap', async () => {
    await connect();
    const settings = configurationSettings(service.draft()!);
    service.setSettings({
      ...settings,
      flap1: { connected: false, reversed: false },
      flap2: { connected: false, reversed: false },
    });

    expect(await service.apply()).toBe(false);
    expect(service.error()).toContain('co najmniej jedna klapa');
  });

  it('reads the flap positions again after a flap output change', async () => {
    await connect();
    const deviceState = TestBed.inject(DeviceStateService);
    await vi.waitFor(() => expect(deviceState.state()?.flap1).toBe(FlapPosition.CLOSED));

    const settings = configurationSettings(service.draft()!);
    service.setSettings({ ...settings, flap1: { connected: false, reversed: false } });
    expect(await service.apply()).toBe(true);
    expect(deviceState.state()?.flap1).toBe(FlapPosition.NOT_CONNECTED);
    expect(deviceState.state()?.flap2).toBe(FlapPosition.CLOSED);

    service.setSettings({ ...settings, flap2: { connected: true, reversed: true } });
    expect(await service.apply()).toBe(true);
    expect(deviceState.state()?.flap1).toBe(FlapPosition.UNKNOWN);
    expect(deviceState.state()?.flap2).toBe(FlapPosition.UNKNOWN);
  });

  it('discards the draft on disconnect', async () => {
    await connect();
    await connection.disconnect();
    TestBed.tick();

    expect(service.draft()).toBeNull();
  });
});
