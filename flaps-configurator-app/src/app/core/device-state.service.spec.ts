import { TestBed } from '@angular/core/testing';
import { BleLinkService } from './ble/ble-link.service';
import { ConnectionService } from './connection.service';
import { DeviceStateService } from './device-state.service';
import {
  Command,
  EventSchema,
  FlapPosition,
  FlapsState,
  FlapTraceSchema,
  LogLevel,
  LogSchema,
  TelemetrySchema,
} from './protocol/gen/flaps_pb';
import { FakeBleLink } from './testing/fake-ble-link';

describe('DeviceStateService', () => {
  let link: FakeBleLink;
  let connection: ConnectionService;
  let service: DeviceStateService;

  const commands = (): Command[] => link.device.received.map((frame) => frame.command);
  const count = (command: Command): number => commands().filter((c) => c === command).length;

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

  it('reports a rejected override', async () => {
    await expect(service.setOverride(FlapsState.OPEN, 700_000)).rejects.toThrow('odrzucił');
    expect(service.override()).toBeNull();
  });

  it('enables dev mode and turns it on again in every new session', async () => {
    await service.setDevMode({ logLevel: LogLevel.DEBUG, flapTrace: true });
    expect(link.device.devMode).toEqual({ logLevel: LogLevel.DEBUG, flapTrace: true });

    // Reset STM32: sesja wygasa, ping dostaje NO_SESSION, aplikacja otwiera ją ponownie
    link.device.sessionActive = false;
    await vi.advanceTimersByTimeAsync(2666);
    await settle();

    expect(count(Command.START_SESSION)).toBe(2);
    expect(link.device.devMode).toEqual({ logLevel: LogLevel.DEBUG, flapTrace: true });
    expect(count(Command.GET_STATE)).toBe(2);
  });

  it('collects device log lines', async () => {
    link.device.sendUnsolicited(Command.LOG, LogSchema, {
      entries: [
        { uptimeMs: 10, level: LogLevel.INFO, text: 'app: session opened' },
        { uptimeMs: 20, level: LogLevel.WARN, text: 'can: no frames' },
      ],
      dropped: 3,
    });
    await settle();

    expect(service.logs().map((line) => line.text)).toEqual([
      'app: session opened',
      'can: no frames',
    ]);
    expect(service.droppedLogs()).toBe(3);
  });

  it('joins a finished move with its AMP_OUT trace', async () => {
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
        },
      },
    });
    link.device.sendUnsolicited(Command.FLAP_TRACE, FlapTraceSchema, {
      flap: 2,
      position: FlapPosition.OPEN,
      intervalMs: 5,
      samples: [1000, 20000, 41000],
    });
    await settle();

    expect(service.state()?.flap2).toBe(FlapPosition.OPEN);
    expect(service.moves()).toHaveLength(1);
    expect(service.moves()[0]).toMatchObject({
      flap: 2,
      durationMs: 250,
      peakAmpOut: 41000,
      ampOutAtStop: 30000,
      trace: { intervalMs: 5, samples: [1000, 20000, 41000] },
    });
  });

  it('clears the state after disconnecting but keeps logs and moves', async () => {
    link.device.sendUnsolicited(Command.LOG, LogSchema, {
      entries: [{ uptimeMs: 1, level: LogLevel.INFO, text: 'x' }],
    });
    await settle();

    await connection.disconnect();
    await settle();

    expect(service.state()).toBeNull();
    expect(service.logs()).toHaveLength(1);
  });
});
