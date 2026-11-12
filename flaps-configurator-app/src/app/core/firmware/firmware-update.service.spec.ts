import { TestBed } from '@angular/core/testing';
import { BleLinkService } from '../ble/ble-link.service';
import { ConfigurationService } from '../configuration.service';
import { ConnectionService } from '../connection.service';
import { DeviceStateService } from '../device-state.service';
import { Command, DeviceMode, FirmwareUpdateError } from '../protocol/gen/flaps_pb';
import { FakeBleLink } from '../testing/fake-ble-link';
import { buildFirmwareImage } from '../testing/firmware-image-builder';
import { FirmwareImage, parseFirmwareImage } from './firmware-image';
import { FirmwareUpdateService } from './firmware-update.service';

describe('FirmwareUpdateService', () => {
  let link: FakeBleLink;
  let connection: ConnectionService;
  let service: FirmwareUpdateService;

  const commands = (): Command[] => link.device.received.map((frame) => frame.command);
  const count = (command: Command): number => commands().filter((c) => c === command).length;
  const image = (version: [number, number, number] = [1, 3, 0], size = 3000): FirmwareImage =>
    parseFirmwareImage('app.bin', buildFirmwareImage({ version, size }));

  /** Wywołuje `action` po wysłaniu n-tej paczki DATA (atrapa odpowiada od razu). */
  const afterChunk = (n: number, action: () => void): void => {
    const write = link.write.bind(link);
    link.write = (bytes: Uint8Array): Promise<void> => {
      const result = write(bytes);
      if (count(Command.FIRMWARE_UPDATE_DATA) === n) {
        action();
      }
      return result;
    };
  };

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) {
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(1);
    }
  };

  /** Uruchamia aktualizację i przewija czas (restart urządzenia) do jej końca. */
  const run = async (promise: Promise<void>): Promise<void> => {
    let finished = false;
    void promise.finally(() => (finished = true));
    for (let i = 0; i < 100 && !finished; i++) {
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(500);
    }
    await promise;
    await settle();
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    link = new FakeBleLink();
    TestBed.configureTestingModule({ providers: [{ provide: BleLinkService, useValue: link }] });
    connection = TestBed.inject(ConnectionService);
    service = TestBed.inject(FirmwareUpdateService);
    TestBed.inject(ConfigurationService);
    TestBed.inject(DeviceStateService);

    await connection.connect({ deviceId: 'AA:BB' });
    await settle();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the image in chunks, waits for the restart and reports the new version', async () => {
    const firmware = image([1, 3, 0], 2600);
    await run(service.start(firmware));

    expect(service.phase()).toBe('done');
    expect(service.versions()).toEqual({ before: '1.2.3', after: '1.3.0' });
    // 2600 B = 1024 + 1024 + 552
    expect(count(Command.FIRMWARE_UPDATE_DATA)).toBe(3);
    expect(count(Command.FIRMWARE_UPDATE_COMMIT)).toBe(1);
    expect(link.device.restarts).toBe(1);
    expect(connection.status()).toBe('connected');
    expect(connection.deviceInfo()?.firmwareVersion).toBe('1.3.0');
    // Nowa sesja po restarcie: stan od nowa
    expect(count(Command.START_SESSION)).toBeGreaterThan(1);
    expect(commands().lastIndexOf(Command.GET_STATE)).toBeGreaterThan(
      commands().indexOf(Command.FIRMWARE_UPDATE_COMMIT),
    );
  });

  it('does not ping in the middle of the transfer', async () => {
    const firmware = image([1, 3, 0], 60_000);
    await run(service.start(firmware));

    const begin = commands().indexOf(Command.FIRMWARE_UPDATE_BEGIN);
    const commit = commands().indexOf(Command.FIRMWARE_UPDATE_COMMIT);
    expect(commands().slice(begin, commit)).not.toContain(Command.PING);
  });

  it('explains a rejected image and aborts the update', async () => {
    link.device.commitError = FirmwareUpdateError.CRC_MISMATCH;
    await run(service.start(image()));

    expect(service.phase()).toBe('failed');
    expect(service.error()).toContain('CRC');
    expect(service.error()).toContain('dotychczasowym firmware');
    expect(count(Command.FIRMWARE_UPDATE_ABORT)).toBe(1);
    expect(link.device.restarts).toBe(0);
  });

  it('stops after the current chunk when aborted', async () => {
    afterChunk(2, () => service.abort());
    await run(service.start(image([1, 3, 0], 20_000)));

    expect(service.phase()).toBe('aborted');
    expect(count(Command.FIRMWARE_UPDATE_DATA)).toBe(2);
    expect(count(Command.FIRMWARE_UPDATE_COMMIT)).toBe(0);
    expect(link.device.update).toBeNull();
  });

  it('works with the bootloader and leaves the recovery mode after the update', async () => {
    const config = TestBed.inject(ConfigurationService);
    await run(service.reboot(true));

    expect(connection.inBootloader()).toBe(true);
    expect(config.draft()).toBeNull();
    const before = count(Command.GET_CONFIGURATION);

    await run(service.start(image([1, 4, 0])));

    expect(service.phase()).toBe('done');
    expect(link.device.mode).toBe(DeviceMode.APPLICATION);
    expect(connection.inBootloader()).toBe(false);
    expect(count(Command.GET_CONFIGURATION)).toBe(before + 1);
  });

  it('fails clearly when the link is lost during the transfer', async () => {
    afterChunk(2, () => link.dropConnection());
    await run(service.start(image([1, 3, 0], 20_000)));

    expect(service.phase()).toBe('failed');
    expect(service.error()).toContain('Połączenie przerwane');
  });
});
