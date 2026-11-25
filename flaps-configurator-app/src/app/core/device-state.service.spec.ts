import { TestBed } from '@angular/core/testing';
import { BleLinkService } from './ble/ble-link.service';
import { ConnectionService } from './connection.service';
import { DevTelemetryService } from './dev-telemetry.service';
import { DeviceStateService } from './device-state.service';
import {
  AmpOutSchema,
  Command,
  EventSchema,
  FlapPosition,
  FlapsState,
  FlapStopReason,
  LogLevel,
  LogSchema,
  TechnicianCommand,
  TelemetrySchema,
} from './protocol/messages';
import { FakeBleLink } from './testing/fake-ble-link';

describe('DeviceStateService', () => {
  let link: FakeBleLink;
  let connection: ConnectionService;
  let service: DeviceStateService;
  /** Logi, AMP_OUT i ruchy klap (aplikacja technika). */
  let dev: DevTelemetryService;

  const commands = (): number[] => link.device.received.map((frame) => frame.command);
  const count = (command: number): number => commands().filter((c) => c === command).length;

  /** Efekty Angulara + odpowiedzi atrapy (mikrozadania). */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) {
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(1);
    }
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    link = new FakeBleLink();
    TestBed.configureTestingModule({ providers: [{ provide: BleLinkService, useValue: link }] });
    connection = TestBed.inject(ConnectionService);
    service = TestBed.inject(DeviceStateService);
    dev = TestBed.inject(DevTelemetryService);

    await connection.connect({ deviceId: 'AA:BB' });
    await settle();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the whole state after the session starts', () => {
    expect(commands()).toContain(Command.GET_STATE);
    expect(service.state()?.activeLogic).toBe(1);
    expect(service.state()?.flap1).toBe(FlapPosition.CLOSED);
    expect(service.state()?.signals.map((s) => s.value)).toEqual([2500, 1]);
  });

  it('applies telemetry and events in sequence', async () => {
    link.device.sendUnsolicited(Command.TELEMETRY, TelemetrySchema, {
      sequence: 11,
      signals: [{ index: 0, value: 4200, fresh: true }],
    });
    link.device.sendUnsolicited(Command.EVENT, EventSchema, {
      sequence: 12,
      event: { case: 'activeLogicChanged', value: { activeLogic: -1 } },
    });
    link.device.sendUnsolicited(Command.EVENT, EventSchema, {
      sequence: 13,
      event: { case: 'flapMoveStarted', value: { flap: 1, position: FlapPosition.OPENING } },
    });
    await settle();

    const state = service.state();
    expect(state?.signals[0].value).toBe(4200);
    expect(state?.activeLogic).toBe(-1);
    expect(state?.flap1).toBe(FlapPosition.OPENING);
  });

  it('reads the state again after a gap in the sequence', async () => {
    link.device.sequence = 20;
    link.device.sendUnsolicited(Command.TELEMETRY, TelemetrySchema, {
      sequence: 15,
      signals: [{ index: 0, value: 9999, fresh: true }],
    });
    await settle();

    expect(count(Command.GET_STATE)).toBe(2);
    expect(service.state()?.signals[0].value).toBe(2500); // zmiana z luki nie została nałożona
  });

  it('opens the flaps manually for the given time and releases them', async () => {
    const before = Date.now();
    await service.setOverride(FlapsState.OPEN, 60_000);

    expect(link.device.state.overrideState).toBe(FlapsState.OPEN);
    expect(service.override()).toBe(FlapsState.OPEN);
    expect(service.overrideUntil()).toBeGreaterThanOrEqual(before + 60_000);

    await service.releaseOverride();

    expect(link.device.state.overrideState).toBe(FlapsState.UNSPECIFIED);
    expect(service.override()).toBeNull();
    expect(service.overrideUntil()).toBeNull();
  });

  it('follows override changes reported by the device', async () => {
    link.device.sendUnsolicited(Command.EVENT, EventSchema, {
      sequence: 11,
      event: {
        case: 'flapsOverrideChanged',
        value: { state: FlapsState.CLOSED, remainingMs: 5000 },
      },
    });
    await settle();
    expect(service.override()).toBe(FlapsState.CLOSED);

    link.device.sendUnsolicited(Command.EVENT, EventSchema, {
      sequence: 12,
      event: { case: 'flapsOverrideChanged', value: { state: FlapsState.UNSPECIFIED } },
    });
    await settle();
    expect(service.override()).toBeNull();
  });

  it('sets a permanent override without a countdown', async () => {
    await service.setOverride(FlapsState.CLOSED, 'permanent');

    expect(link.device.state.overrideState).toBe(FlapsState.CLOSED);
    expect(link.device.state.overridePermanent).toBe(true);
    expect(service.override()).toBe(FlapsState.CLOSED);
    expect(service.overridePermanent()).toBe(true);
    expect(service.overrideUntil()).toBeNull();

    await service.releaseOverride();
    expect(service.override()).toBeNull();
    expect(service.overridePermanent()).toBe(false);
  });

  it('follows a permanent override reported by the device', async () => {
    link.device.sendUnsolicited(Command.EVENT, EventSchema, {
      sequence: 11,
      event: {
        case: 'flapsOverrideChanged',
        value: { state: FlapsState.OPEN, remainingMs: 0, permanent: true },
      },
    });
    await settle();

    expect(service.override()).toBe(FlapsState.OPEN);
    expect(service.overridePermanent()).toBe(true);
    expect(service.overrideUntil()).toBeNull();
  });

  it('does not send a permanent override to older firmware', async () => {
    await connection.disconnect();
    link.device.protocolMinor = 14;
    await connection.connect({ deviceId: 'AA:BB' });
    await settle();
    link.device.received.length = 0;

    expect(service.permanentOverrideSupported()).toBe(false);
    await expect(service.setOverride(FlapsState.OPEN, 'permanent')).rejects.toThrow('1.15');
    expect(count(Command.SET_FLAPS_OVERRIDE)).toBe(0);
  });

  it('reports a rejected override', async () => {
    await expect(service.setOverride(FlapsState.OPEN, 700_000)).rejects.toThrow('odrzucił');
    expect(service.override()).toBeNull();
  });

  it('collects AMP_OUT samples and marks gaps between frames', async () => {
    link.device.sendUnsolicited(TechnicianCommand.AMP_OUT, AmpOutSchema, {
      uptimeMs: 1000,
      intervalMs: 20,
      flap1: [100, 200],
      flap2: [300, 400],
    });
    link.device.sendUnsolicited(TechnicianCommand.AMP_OUT, AmpOutSchema, {
      uptimeMs: 1040,
      intervalMs: 20,
      flap1: [500],
      flap2: [600],
    });
    // 1060 i 1080 zgubione
    link.device.sendUnsolicited(TechnicianCommand.AMP_OUT, AmpOutSchema, {
      uptimeMs: 1100,
      intervalMs: 20,
      flap1: [700],
      flap2: [800],
    });
    await settle();

    expect(dev.ampOut()).toEqual([
      { uptimeMs: 1000, flap1: 100, flap2: 300, gap: false },
      { uptimeMs: 1020, flap1: 200, flap2: 400, gap: false },
      { uptimeMs: 1040, flap1: 500, flap2: 600, gap: false },
      { uptimeMs: 1100, flap1: 700, flap2: 800, gap: true },
    ]);
  });

  it('keeps AMP_OUT history for five minutes and starts over after a device reset', async () => {
    const send = (uptimeMs: number): void =>
      link.device.sendUnsolicited(TechnicianCommand.AMP_OUT, AmpOutSchema, {
        uptimeMs,
        intervalMs: 20,
        flap1: [1],
        flap2: [2],
      });
    send(1000);
    send(30_000);
    send(302_000);
    await settle();
    expect(dev.ampOut().map((s) => s.uptimeMs)).toEqual([30_000, 302_000]);

    send(500); // uptime się cofnął
    await settle();
    expect(dev.ampOut().map((s) => s.uptimeMs)).toEqual([500]);
  });

  it('marks flap move starts on the AMP_OUT timeline', async () => {
    link.device.sendUnsolicited(Command.EVENT, EventSchema, {
      sequence: 11,
      uptimeMs: 5000,
      event: { case: 'flapMoveStarted', value: { flap: 1, position: FlapPosition.OPENING } },
    });
    link.device.sendUnsolicited(Command.EVENT, EventSchema, {
      sequence: 12,
      uptimeMs: 5400,
      event: { case: 'flapMoveStarted', value: { flap: 2, position: FlapPosition.CLOSING } },
    });
    await settle();

    expect(service.state()?.flap1).toBe(FlapPosition.OPENING);
    expect(dev.moveMarks()).toMatchObject([
      { uptimeMs: 5000, flap: 1, position: FlapPosition.OPENING },
      { uptimeMs: 5400, flap: 2, position: FlapPosition.CLOSING },
    ]);
  });

  it('collects device log lines', async () => {
    link.device.sendUnsolicited(TechnicianCommand.LOG, LogSchema, {
      entries: [
        { uptimeMs: 10, level: LogLevel.INFO, text: 'app: session opened' },
        { uptimeMs: 20, level: LogLevel.WARN, text: 'can: no frames' },
      ],
      dropped: 3,
    });
    await settle();

    expect(dev.logs().map((line) => line.text)).toEqual(['app: session opened', 'can: no frames']);
    expect(dev.droppedLogs()).toBe(3);
  });

  it('records a finished move with its AMP_OUT diagnostics', async () => {
    link.device.sendUnsolicited(Command.EVENT, EventSchema, {
      sequence: 11,
      event: {
        case: 'flapMoveFinished',
        value: {
          flap: 2,
          position: FlapPosition.OPEN,
          durationMs: 250,
          peakAmpOut: 41000,
          ampOutAtStop: 30000,
          stopReason: FlapStopReason.END_STOP,
        },
      },
    });
    await settle();

    expect(service.state()?.flap2).toBe(FlapPosition.OPEN);
    expect(dev.moves()).toHaveLength(1);
    expect(dev.moves()[0]).toMatchObject({
      flap: 2,
      durationMs: 250,
      peakAmpOut: 41000,
      ampOutAtStop: 30000,
      stopReason: FlapStopReason.END_STOP,
    });
  });

  it('clears the state after disconnecting, the diagnostics stay', async () => {
    link.device.sendUnsolicited(TechnicianCommand.LOG, LogSchema, {
      entries: [{ uptimeMs: 1, level: LogLevel.INFO, text: 'x' }],
    });
    await settle();

    await connection.disconnect();
    await settle();

    expect(service.state()).toBeNull();
    expect(dev.logs()).toHaveLength(1);
  });
});
