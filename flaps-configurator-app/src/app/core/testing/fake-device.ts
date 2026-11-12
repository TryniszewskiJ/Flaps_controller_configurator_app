import {
  clone,
  create,
  DescMessage,
  fromBinary,
  MessageInitShape,
  toBinary,
} from '@bufbuild/protobuf';
import { FirmwareImageError, MAX_IMAGE_SIZE, parseFirmwareImage } from '../firmware/firmware-image';
import { encodeFrame, Frame, FrameParser } from '../protocol/frame';
import {
  BootloaderReason,
  CloseSessionResponseSchema,
  Command,
  Configuration,
  ConfigurationError,
  ConfigurationSchema,
  DeviceMode,
  DeviceState,
  DeviceStateSchema,
  ErrorResponseSchema,
  FirmwareUpdateAbortResponseSchema,
  FirmwareUpdateBeginRequestSchema,
  FirmwareUpdateBeginResponseSchema,
  FirmwareUpdateCommitResponseSchema,
  FirmwareUpdateDataRequestSchema,
  FirmwareUpdateDataResponseSchema,
  FirmwareUpdateError,
  FlapPosition,
  FlapsState,
  GetConfigurationResponseSchema,
  GetDeviceInfoResponseSchema,
  GetStateResponseSchema,
  LogLevel,
  PingResponseSchema,
  RebootRequestSchema,
  RebootResponseSchema,
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
  firmwareVersion: [number, number, number] = [1, 2, 3];
  mode = DeviceMode.APPLICATION;
  bootloaderReason = BootloaderReason.UNSPECIFIED;
  /** Restart po COMMIT / REBOOT: tyle ms bez odpowiedzi (bootloader instaluje obraz). */
  restartMs = 3000;
  /** Wymuszony błąd COMMIT (np. CRC_MISMATCH). */
  commitError = FirmwareUpdateError.UNSPECIFIED;
  /** Obraz w stagingu; null — brak aktualizacji. */
  update: { image: Uint8Array; received: number } | null = null;
  /** Ile razy urządzenie się zrestartowało. */
  restarts = 0;

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
        this.update = null; // nowa sesja kończy aktualizację
        // Tryb dev wyłącza się przy każdym START_SESSION
        this.devMode = { logLevel: LogLevel.OFF, flapTrace: false };
        this.respond(frame, StartSessionResponseSchema, {
          status: this.startSessionStatus,
          protocolVersionMajor: 1,
          protocolVersionMinor: 9,
          sessionTimeoutMs: this.sessionTimeoutMs,
        });
        return;
      case Command.CLOSE_SESSION:
        this.respond(frame, CloseSessionResponseSchema, {});
        this.sessionActive = false;
        this.update = null;
        return;
    }

    if (!this.sessionActive) {
      this.error(frame, Status.NO_SESSION);
      return;
    }

    switch (frame.command) {
      case Command.GET_DEVICE_INFO:
        this.respond(frame, GetDeviceInfoResponseSchema, {
          firmwareVersionMajor: this.firmwareVersion[0],
          firmwareVersionMinor: this.firmwareVersion[1],
          firmwareVersionPatch: this.firmwareVersion[2],
          deviceUid: new Uint8Array(12).fill(0xab),
          mode: this.mode,
          bootloaderReason: this.bootloaderReason,
        });
        return;
      case Command.PING:
        this.respond(frame, PingResponseSchema, { uptimeMs: 1000 });
        return;
      case Command.FIRMWARE_UPDATE_BEGIN:
      case Command.FIRMWARE_UPDATE_DATA:
      case Command.FIRMWARE_UPDATE_COMMIT:
      case Command.FIRMWARE_UPDATE_ABORT:
      case Command.REBOOT:
        this.handleUpdate(frame);
        return;
    }

    if (this.mode === DeviceMode.BOOTLOADER) {
      // Bootloader: tylko sesja, informacje i aktualizacja
      this.error(frame, Status.UNKNOWN_COMMAND);
      return;
    }

    switch (frame.command) {
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

  private handleUpdate(frame: Frame): void {
    switch (frame.command) {
      case Command.FIRMWARE_UPDATE_BEGIN: {
        const { imageSize } = fromBinary(FirmwareUpdateBeginRequestSchema, frame.payload);
        if (imageSize === 0 || imageSize > MAX_IMAGE_SIZE) {
          this.respondUpdate(
            frame,
            FirmwareUpdateBeginResponseSchema,
            FirmwareUpdateError.INVALID_SIZE,
          );
          return;
        }
        this.update = { image: new Uint8Array(imageSize), received: 0 };
        this.respond(frame, FirmwareUpdateBeginResponseSchema, {
          status: Status.OK,
          maxChunkSize: 1024,
          maxImageSize: MAX_IMAGE_SIZE,
        });
        return;
      }
      case Command.FIRMWARE_UPDATE_DATA: {
        const { offset, data } = fromBinary(FirmwareUpdateDataRequestSchema, frame.payload);
        const update = this.update;
        if (!update) {
          this.respondUpdate(
            frame,
            FirmwareUpdateDataResponseSchema,
            FirmwareUpdateError.NOT_STARTED,
          );
          return;
        }
        if (offset !== update.received) {
          this.respond(frame, FirmwareUpdateDataResponseSchema, {
            status: Status.FIRMWARE_UPDATE_ERROR,
            error: FirmwareUpdateError.INVALID_OFFSET,
            received: update.received,
          });
          return;
        }
        const last = offset + data.length === update.image.length;
        if (
          data.length === 0 ||
          data.length > 1024 ||
          offset + data.length > update.image.length ||
          (!last && data.length % 32 !== 0)
        ) {
          this.respondUpdate(
            frame,
            FirmwareUpdateDataResponseSchema,
            FirmwareUpdateError.INVALID_LENGTH,
          );
          return;
        }
        update.image.set(data, offset);
        update.received += data.length;
        this.respond(frame, FirmwareUpdateDataResponseSchema, {
          status: Status.OK,
          received: update.received,
        });
        return;
      }
      case Command.FIRMWARE_UPDATE_COMMIT: {
        const update = this.update;
        const error = !update
          ? FirmwareUpdateError.NOT_STARTED
          : update.received < update.image.length
            ? FirmwareUpdateError.INCOMPLETE
            : this.commitError !== FirmwareUpdateError.UNSPECIFIED
              ? this.commitError
              : checkImage(update.image);
        if (error !== FirmwareUpdateError.UNSPECIFIED || !update) {
          this.respondUpdate(frame, FirmwareUpdateCommitResponseSchema, error);
          return;
        }
        this.respond(frame, FirmwareUpdateCommitResponseSchema, { status: Status.OK });
        const image = parseFirmwareImage('staging', update.image);
        this.restart(() => {
          this.firmwareVersion = image.versionParts;
          this.mode = DeviceMode.APPLICATION;
          this.bootloaderReason = BootloaderReason.UNSPECIFIED;
        });
        return;
      }
      case Command.FIRMWARE_UPDATE_ABORT:
        this.update = null;
        this.respond(frame, FirmwareUpdateAbortResponseSchema, {});
        return;
      case Command.REBOOT: {
        const { toBootloader } = fromBinary(RebootRequestSchema, frame.payload);
        this.respond(frame, RebootResponseSchema, { status: Status.OK });
        this.restart(() => {
          this.mode = toBootloader ? DeviceMode.BOOTLOADER : DeviceMode.APPLICATION;
          this.bootloaderReason = toBootloader
            ? BootloaderReason.REQUESTED
            : BootloaderReason.UNSPECIFIED;
        });
        return;
      }
    }
  }

  /** Reset STM32: sesja i aktualizacja znikają, przez restartMs brak odpowiedzi. */
  private restart(afterBoot: () => void): void {
    this.restarts++;
    this.sessionActive = false;
    this.update = null;
    this.responding = false;
    setTimeout(() => {
      afterBoot();
      this.responding = true;
    }, this.restartMs);
  }

  private respondUpdate<T extends DescMessage>(
    request: Frame,
    schema: T,
    error: FirmwareUpdateError,
  ): void {
    this.respond(request, schema, {
      status: Status.FIRMWARE_UPDATE_ERROR,
      error,
    } as unknown as MessageInitShape<T>);
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

function checkImage(image: Uint8Array): FirmwareUpdateError {
  try {
    parseFirmwareImage('staging', image);
    return FirmwareUpdateError.UNSPECIFIED;
  } catch (error) {
    if (!(error instanceof FirmwareImageError)) {
      throw error;
    }
    return /CRC/.test(error.message)
      ? FirmwareUpdateError.CRC_MISMATCH
      : /płytkę/.test(error.message)
        ? FirmwareUpdateError.WRONG_BOARD
        : FirmwareUpdateError.INVALID_IMAGE;
  }
}
