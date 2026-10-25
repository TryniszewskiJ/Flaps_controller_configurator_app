import { TestBed } from '@angular/core/testing';
import { create } from '@bufbuild/protobuf';
import { BleLinkService } from './ble/ble-link.service';
import { ConfigurationService } from './configuration.service';
import { ConnectionService } from './connection.service';
import {
  CanFrameSchema,
  ConfigurationError,
  FlapsState,
  LogicSchema,
  SignalSchema,
  Status,
} from './protocol/gen/flaps_pb';
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
    service.setSettings({ ...service.draft()!, defaultLogicIndex: 1 });

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
      moveTimeMs: 400,
      fdcanTermination: true,
    });

    const draft = service.draft()!;
    expect(draft.selectorSignal).toBeUndefined();
    expect(draft.failSafeState).toBe(FlapsState.OPEN);
    expect(draft.moveTimeMs).toBe(400);
    expect(draft.fdcanTermination).toBe(true);
    expect(service.dirty()).toBe(true);
  });

  it('discards the draft on disconnect', async () => {
    await connect();
    await connection.disconnect();
    TestBed.tick();

    expect(service.draft()).toBeNull();
  });
});
