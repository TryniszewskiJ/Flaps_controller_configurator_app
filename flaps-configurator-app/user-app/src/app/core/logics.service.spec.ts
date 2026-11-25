import { TestBed } from '@angular/core/testing';
import { create } from '@bufbuild/protobuf';
import { BleLinkService } from '@flaps/core/ble/ble-link.service';
import { APP_ID, ConnectionService } from '@flaps/core/connection.service';
import { Command, FlapsState, Status } from '@flaps/core/protocol/gen/flaps_common_pb';
import { FixedLogicSchema, LogicSchema } from '@flaps/core/protocol/gen/flaps_logic_pb';
import { LogicError } from '@flaps/core/protocol/gen/flaps_user_pb';
import { StartSessionRequestSchema } from '@flaps/core/protocol/gen/flaps_common_pb';
import { FakeBleLink } from '@flaps/core/testing/fake-ble-link';
import { USER_APP_ID as FIRMWARE_USER_APP_ID } from '@flaps/core/testing/fake-device';
import { fromBinary } from '@bufbuild/protobuf';
import { USER_APP_ID } from '../user-app';
import { LogicsService } from './logics.service';

describe('LogicsService', () => {
  let link: FakeBleLink;
  let connection: ConnectionService;
  let service: LogicsService;

  const commands = (): number[] => link.device.received.map((frame) => frame.command);
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) {
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(1);
    }
  };
  const openLogic = create(LogicSchema, {
    selectorValue: 9,
    description: 'Głośno',
    parameters: { case: 'fixed', value: create(FixedLogicSchema, { state: FlapsState.OPEN }) },
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    link = new FakeBleLink();
    TestBed.configureTestingModule({
      providers: [
        { provide: BleLinkService, useValue: link },
        { provide: APP_ID, useValue: USER_APP_ID },
      ],
    });
    connection = TestBed.inject(ConnectionService);
    service = TestBed.inject(LogicsService);

    await connection.connect({ deviceId: 'AA:BB' });
    await settle();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a user app session and reads only the logics', () => {
    expect(USER_APP_ID).toBe(FIRMWARE_USER_APP_ID);
    const start = link.device.received.find((frame) => frame.command === Command.START_SESSION)!;
    expect(fromBinary(StartSessionRequestSchema, start.payload).appId).toBe(USER_APP_ID);

    expect(commands()).toContain(Command.GET_LOGICS);
    // Konfiguracji (ramek, sygnałów, ustawień) aplikacja użytkownika nie pobiera
    expect(commands().every((command) => command < 0x05 || command > 0x07)).toBe(true);

    expect(service.draft()?.logics.map((logic) => logic.description)).toEqual([
      'Standard',
      'Sport',
    ]);
    expect(service.names()?.signals).toEqual(['RPM', 'Drive mode']);
    expect(service.selectorSignal()).toBe(1);
    expect(service.dirty()).toBe(false);
  });

  it('tries edited logics on the device without saving them', async () => {
    service.setLogic(1, openLogic);
    expect(service.dirty()).toBe(true);

    expect(await service.apply()).toBe(true);

    expect(link.device.configuration.logics[1].description).toBe('Głośno');
    expect(link.device.configuration.signals).toHaveLength(2); // reszta bez zmian
    expect(service.dirty()).toBe(false);
    expect(service.unsavedOnDevice()).toBe(true);
  });

  it('saves the logics permanently', async () => {
    service.setLogic(null, openLogic);

    expect(await service.save()).toBe(true);

    expect(link.device.configuration.logics).toHaveLength(3);
    expect(link.device.unsavedChanges).toBe(false);
    expect(service.unsavedOnDevice()).toBe(false);
  });

  it('shows why the device rejected the logics and keeps the draft', async () => {
    link.device.rejectLogics = LogicError.DUPLICATE_SELECTOR_VALUE;
    service.setLogic(1, openLogic);

    expect(await service.apply()).toBe(false);

    expect(service.error()).toContain('tę samą wartość selektora');
    expect(service.dirty()).toBe(true);
    expect(link.device.configuration.logics[1].description).toBe('Sport');
  });

  it('keeps the default logic pointing at the same logic after a removal', () => {
    service.setLogic(null, openLogic);
    service.setLogic(2, { ...openLogic, description: 'Domyślna' });
    service['edit']((draft) => (draft.defaultLogicIndex = 2));

    expect(service.removeLogic(0)).toBeNull();
    expect(service.draft()?.defaultLogicIndex).toBe(1);
    expect(service.draft()?.logics[1].description).toBe('Domyślna');
  });

  it('cannot remove the last logic', () => {
    service.removeLogic(0);
    expect(service.removeLogic(0)).toContain('co najmniej jednego');
  });

  it('cannot use the technician commands in its session', async () => {
    await expect(
      connection.request(
        0x05, // GET_CONFIGURATION
        StartSessionRequestSchema,
        {},
        StartSessionRequestSchema,
        { retries: 0 },
      ),
    ).rejects.toMatchObject({ status: Status.UNKNOWN_COMMAND });
  });

  it('asks for a firmware update when the device does not know the user app', async () => {
    await connection.disconnect();
    link.device.knownAppIds = [0x464c4150];
    await connection.connect({ deviceId: 'AA:BB' }).catch(() => undefined);
    await settle();

    expect(connection.connected()).toBe(false);
    expect(connection.error()).toContain('aktualizacja jego firmware');
    expect(service.draft()).toBeNull();
  });
});
