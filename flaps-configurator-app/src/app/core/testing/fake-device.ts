import {
  clone,
  create,
  DescMessage,
  fromBinary,
  MessageInitShape,
  toBinary,
} from '@bufbuild/protobuf';
import { encodeFrame, Frame, FrameParser } from '../protocol/frame';
import {
  CloseSessionResponseSchema,
  Command,
  Configuration,
  ConfigurationError,
  ConfigurationSchema,
  DeviceState,
  DeviceStateSchema,
  ErrorResponseSchema,
  FlapPosition,
  FlapsState,
  GetConfigurationResponseSchema,
  GetDeviceInfoResponseSchema,
  GetStateResponseSchema,
  LogLevel,
  PingResponseSchema,
  SaveConfigurationResponseSchema,
  SetConfigurationRequestSchema,
  SetConfigurationResponseSchema,
  SetDevModeRequestSchema,
  SetDevModeResponseSchema,
  SetFlapsOverrideRequestSchema,
  SetFlapsOverrideResponseSchema,
  StartSessionResponseSchema,
  Status,
} from '../protocol/gen/flaps_pb';

/** Domyślna konfiguracja firmware (README „Konfiguracja domyślna”), skrócona do dwóch logik. */
export function defaultConfiguration(): Configuration {
  return create(ConfigurationSchema, {
    frames: [{ id: 0x180, timeoutMs: 1000 }, { id: 0x56c }],
    signals: [
      { frameIndex: 0, startingBit: 7, lengthBits: 16, bigEndian: true, scale: 0.125, name: 'RPM' },
      {
        frameIndex: 1,
        startingBit: 13,
        lengthBits: 3,
        bigEndian: true,
        scale: 1,
        name: 'Drive mode',
      },
    ],
    logics: [
      {
        selectorValue: 0,
        description: 'Standard',
        inputSignal: 0,
        parameters: { case: 'hysteresis', value: { openAbove: 4000, closeBelow: 3500 } },
      },
      {
        selectorValue: 1,
        description: 'Sport',
        inputSignal: 0,
        parameters: { case: 'hysteresis', value: { openAbove: 500, closeBelow: 300 } },
      },
    ],
    selectorSignal: 1,
    failSafeState: FlapsState.CLOSED,
    moveTimeMs: 250,
    flap1: {},
    flap2: {},
  });
}

/**
 * Atrapa sterownika do testów: odpowiada na komendy jak AppProtocol w firmware STM32
 * (sesja, ERROR(NO_SESSION) bez sesji, odpowiedź z bitem 0x80 i tym samym SEQ).
 */
export class FakeDevice {
  sessionActive = false;
  /** Gdy false, urządzenie nie odpowiada (np. zawieszony STM32). */
  responding = true;
  sessionTimeoutMs = 8000;
  startSessionStatus = Status.OK;
  configuration = defaultConfiguration();
  /** Konfiguracja ustawiona przez SET_CONFIGURATION, jeszcze nie zapisana. */
  unsavedChanges = false;
  /** Błąd, z którym SET_CONFIGURATION odrzuci następną konfigurację. */
  rejectConfiguration = ConfigurationError.UNSPECIFIED;
  saveStatus = Status.OK;
  /** Stan zwracany przez GET_STATE. */
  state: DeviceState = create(DeviceStateSchema, {
    signals: [
      { index: 0, value: 2500, fresh: true },
      { index: 1, value: 1, fresh: true },
    ],
    activeLogic: 1,
    flap1: FlapPosition.CLOSED,
    flap2: FlapPosition.CLOSED,
  });
  /** Licznik TELEMETRY / EVENT; GET_STATE zwraca ostatni numer. */
  sequence = 10;
  devMode = { logLevel: LogLevel.OFF, flapTrace: false };
  readonly received: Frame[] = [];

  private readonly parser = new FrameParser((frame) => this.handle(frame));

  constructor(private readonly reply: (bytes: Uint8Array) => void) {}

  /** Ramka bez żądania (TELEMETRY, EVENT, LOG, FLAP_TRACE) — SEQ = 0 jak w firmware. */
  sendUnsolicited<T extends DescMessage>(
    command: Command,
    schema: T,
    message: MessageInitShape<T>,
  ): void {
    const payload = toBinary(schema, create(schema, message));
    this.reply(encodeFrame({ command, seq: 0, payload }));
  }

  /** Bajty wysłane przez aplikację. */
  write(bytes: Uint8Array): void {
    this.parser.push(bytes);
  }

  private handle(frame: Frame): void {
    this.received.push(frame);
    if (!this.responding) {
      return;
    }

    switch (frame.command) {
      case Command.START_SESSION:
        this.sessionActive = this.startSessionStatus === Status.OK;
        // Tryb dev wyłącza się przy każdym START_SESSION
        this.devMode = { logLevel: LogLevel.OFF, flapTrace: false };
        this.respond(frame, StartSessionResponseSchema, {
          status: this.startSessionStatus,
          protocolVersionMajor: 1,
          protocolVersionMinor: 8,
          sessionTimeoutMs: this.sessionTimeoutMs,
        });
        return;
      case Command.CLOSE_SESSION:
        this.respond(frame, CloseSessionResponseSchema, {});
        this.sessionActive = false;
        return;
    }

    if (!this.sessionActive) {
      this.error(frame, Status.NO_SESSION);
      return;
    }

    switch (frame.command) {
      case Command.GET_DEVICE_INFO:
        this.respond(frame, GetDeviceInfoResponseSchema, {
          firmwareVersionMajor: 1,
          firmwareVersionMinor: 2,
          firmwareVersionPatch: 3,
          deviceUid: new Uint8Array(12).fill(0xab),
        });
        return;
      case Command.PING:
        this.respond(frame, PingResponseSchema, { uptimeMs: 1000 });
        return;
      case Command.GET_CONFIGURATION:
        this.respond(frame, GetConfigurationResponseSchema, {
          configuration: clone(ConfigurationSchema, this.configuration),
          unsavedChanges: this.unsavedChanges,
        });
        return;
      case Command.SET_CONFIGURATION: {
        const { configuration } = fromBinary(SetConfigurationRequestSchema, frame.payload);
        const error =
          configuration?.flap1?.disconnected && configuration.flap2?.disconnected
            ? ConfigurationError.NO_FLAP_CONNECTED
            : this.rejectConfiguration;
        if (error !== ConfigurationError.UNSPECIFIED || !configuration) {
          this.respond(frame, SetConfigurationResponseSchema, {
            status: Status.INVALID_CONFIGURATION,
            error,
          });
          return;
        }
        this.configuration = configuration;
        this.unsavedChanges = true;
        this.respond(frame, SetConfigurationResponseSchema, { status: Status.OK });
        return;
      }
      case Command.SAVE_CONFIGURATION:
        if (this.saveStatus === Status.OK) {
          this.unsavedChanges = false;
        }
        this.respond(frame, SaveConfigurationResponseSchema, { status: this.saveStatus });
        return;
      case Command.GET_STATE:
        this.respond(frame, GetStateResponseSchema, {
          state: clone(DeviceStateSchema, this.state),
          sequence: this.sequence,
        });
        return;
      case Command.SET_DEV_MODE: {
        const { logLevel, flapTrace } = fromBinary(SetDevModeRequestSchema, frame.payload);
        this.devMode = { logLevel, flapTrace };
        this.respond(frame, SetDevModeResponseSchema, { status: Status.OK });
        return;
      }
      case Command.SET_FLAPS_OVERRIDE: {
        const { state, durationMs } = fromBinary(SetFlapsOverrideRequestSchema, frame.payload);
        const ending = state === FlapsState.UNSPECIFIED;
        if (!ending && (durationMs < 1 || durationMs > 600_000)) {
          this.respond(frame, SetFlapsOverrideResponseSchema, { status: Status.INVALID_OVERRIDE });
          return;
        }
        this.state.overrideState = state;
        this.state.overrideRemainingMs = ending ? 0 : durationMs;
        this.respond(frame, SetFlapsOverrideResponseSchema, { status: Status.OK });
        return;
      }
      default:
        this.error(frame, Status.UNKNOWN_COMMAND);
    }
  }

  private respond<T extends DescMessage>(
    request: Frame,
    schema: T,
    message: MessageInitShape<T>,
  ): void {
    const payload = toBinary(schema, create(schema, message));
    this.reply(encodeFrame({ command: request.command | 0x80, seq: request.seq, payload }));
  }

  private error(request: Frame, status: Status): void {
    const payload = toBinary(ErrorResponseSchema, create(ErrorResponseSchema, { status }));
    this.reply(encodeFrame({ command: Command.ERROR, seq: request.seq, payload }));
  }
}
