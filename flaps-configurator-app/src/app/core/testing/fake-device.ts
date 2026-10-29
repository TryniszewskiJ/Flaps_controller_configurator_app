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
  ErrorResponseSchema,
  FlapsState,
  GetConfigurationResponseSchema,
  GetDeviceInfoResponseSchema,
  PingResponseSchema,
  SaveConfigurationResponseSchema,
  SetConfigurationRequestSchema,
  SetConfigurationResponseSchema,
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
  readonly received: Frame[] = [];

  private readonly parser = new FrameParser((frame) => this.handle(frame));

  constructor(private readonly reply: (bytes: Uint8Array) => void) {}

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
        this.respond(frame, StartSessionResponseSchema, {
          status: this.startSessionStatus,
          protocolVersionMajor: 1,
          protocolVersionMinor: 5,
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
        if (this.rejectConfiguration !== ConfigurationError.UNSPECIFIED || !configuration) {
          this.respond(frame, SetConfigurationResponseSchema, {
            status: Status.INVALID_CONFIGURATION,
            error: this.rejectConfiguration,
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
