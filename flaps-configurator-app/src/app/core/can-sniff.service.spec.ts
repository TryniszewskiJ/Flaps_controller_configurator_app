import { TestBed } from '@angular/core/testing';
import { MessageInitShape } from '@bufbuild/protobuf';
import { BleLinkService } from './ble/ble-link.service';
import { CAN_SNIFF_HISTORY, CanSniffService } from './can-sniff.service';
import { ConnectionService } from './connection.service';
import { CanSniffFrameSchema, CanSniffSchema, Command } from './protocol/gen/flaps_pb';
import { FakeBleLink } from './testing/fake-ble-link';

describe('CanSniffService', () => {
  let link: FakeBleLink;
  let connection: ConnectionService;
  let service: CanSniffService;

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) {
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(1);
    }
  };

  const frame = (
    timeUs: number,
    id: number,
    data: number[],
    extendedId = false,
  ): MessageInitShape<typeof CanSniffFrameSchema> => ({
    timeUs,
    id,
    extendedId,
    data: new Uint8Array(data),
  });

  const send = async (
    frames: MessageInitShape<typeof CanSniffFrameSchema>[],
    dropped = 0,
  ): Promise<void> => {
    link.device.sendUnsolicited(Command.CAN_SNIFF, CanSniffSchema, {
      sequence: 1,
      dropped,
      frames,
    });
    await settle();
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    link = new FakeBleLink();
    TestBed.configureTestingModule({ providers: [{ provide: BleLinkService, useValue: link }] });
    connection = TestBed.inject(ConnectionService);
    service = TestBed.inject(CanSniffService);
    await connection.connect({ deviceId: 'AA:BB' });
    await settle();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts sniffing all frames and collects them', async () => {
    await service.start(true);
    expect(link.device.sniff).toEqual({ allFrames: true });
    expect(service.active()).toBe(true);

    await send([frame(1000, 0x180, [1, 2]), frame(2000, 0x18ff0001, [3], true)], 2);

    expect(service.history().map((f) => f.canId)).toEqual([0x180, 0x18ff0001]);
    expect(service.received()).toBe(2);
    expect(service.dropped()).toBe(2);
  });

  it('keeps the latest frame of each ID with its count, period and changed bytes', async () => {
    await service.start(false);
    await send([frame(1000, 0x56c, [1, 2]), frame(1500, 0x180, [9]), frame(11_000, 0x56c, [1, 7])]);

    const latest = service.latest();
    expect(latest.map((l) => l.frame.canId)).toEqual([0x180, 0x56c]);
    expect(latest[1]).toMatchObject({ count: 2, periodUs: 10_000, changed: [false, true] });
    expect(latest[0]).toMatchObject({ count: 1, periodUs: null });
  });

  it('starts again from scratch and keeps only the latest history', async () => {
    await service.start(true);
    await send(Array.from({ length: 64 }, (_, i) => frame(i, 0x100, [i])));
    for (let i = 0; i < CAN_SNIFF_HISTORY / 64; i++) {
      await send(Array.from({ length: 64 }, (_, j) => frame(i * 64 + j, 0x200, [j])));
    }
    expect(service.history()).toHaveLength(CAN_SNIFF_HISTORY);
    expect(service.history().every((f) => f.canId === 0x200)).toBe(true);

    await service.start(true);
    expect(service.history()).toEqual([]);
    expect(service.latest()).toEqual([]);
    expect(service.received()).toBe(0);
  });

  it('stops with the device summary and ignores frames afterwards', async () => {
    await service.start(true);
    await service.stop();

    expect(link.device.sniff).toBeNull();
    expect(service.active()).toBe(false);
    expect(service.summary()).toEqual({ frames: 3, dropped: 1 });

    await send([frame(1000, 0x180, [1])]);
    expect(service.history()).toEqual([]);
  });

  it('ends with the connection', async () => {
    await service.start(true);
    await connection.disconnect();
    await settle();

    expect(service.active()).toBe(false);
  });
});
