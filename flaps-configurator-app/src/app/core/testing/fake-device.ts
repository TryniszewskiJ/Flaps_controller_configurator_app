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
  CanSniffStartRequestSchema,
  CanSniffStartResponseSchema,
  CanSniffStopResponseSchema,
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
  FlapStopMode,
  GetConfigurationResponseSchema,
  GetDeviceInfoResponseSchema,
  GetLogicsResponseSchema,
  GetStateResponseSchema,
  LogicError,
  LogicSchema,
  PingResponseSchema,
  RebootRequestSchema,
  RebootResponseSchema,
  SaveConfigurationResponseSchema,
  SetConfigurationRequestSchema,
  SetConfigurationResponseSchema,
  SetFlapsOverrideRequestSchema,
  SetFlapsOverrideResponseSchema,
  SetLogicsRequestSchema,
  SetLogicsResponseSchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
  Status,
  TechnicianCommand,
} from '../protocol/messages';
import { TECHNICIAN_APP_ID } from '../../technician-app';

/** app_id aplikacji użytkownika ("FLPU", user-app/src/app/user-app.ts). */
export const USER_APP_ID = 0x464c5055;

/** Komendy, które firmware przyjmuje w sesji aplikacji użytkownika (AppProtocol::isUserCommand). */
const USER_COMMANDS = new Set<number>([
  Command.GET_DEVICE_INFO,
  Command.PING,
  Command.GET_STATE,
  Command.SET_FLAPS_OVERRIDE,
  Command.FIRMWARE_UPDATE_BEGIN,
  Command.FIRMWARE_UPDATE_DATA,
  Command.FIRMWARE_UPDATE_COMMIT,
  Command.FIRMWARE_UPDATE_ABORT,
  Command.REBOOT,
  Command.GET_LOGICS,
  Command.SET_LOGICS,
]);

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
    stopMode: FlapStopMode.TIME,
    endStop: { threshold: 12_000, blankingMs: 150, timeoutMs: 1000 },
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
  /** Wersja minor protokołu z START_SESSION (starszy firmware). */
  protocolMinor = 15;
  /** app_id z ostatniego START_SESSION — sesja aplikacji użytkownika ma tylko jej komendy. */
  sessionAppId: number | null = null;
  /** app_id, które firmware zna; starszy (< 1.15) zna tylko aplikację technika. */
  knownAppIds = [TECHNICIAN_APP_ID, USER_APP_ID];
  configuration = defaultConfiguration();
  /** Konfiguracja ustawiona przez SET_CONFIGURATION, jeszcze nie zapisana. */
  unsavedChanges = false;
  /** Błąd, z którym SET_CONFIGURATION odrzuci następną konfigurację. */
  rejectConfiguration = ConfigurationError.UNSPECIFIED;
  saveStatus = Status.OK;
  /** Błąd, z którym SET_LOGICS odrzuci następne logiki. */
  rejectLogics = LogicError.UNSPECIFIED;
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
  /** Trwający podsłuch CAN (CAN_SNIFF_START); null — brak. */
  sniff: { allFrames: boolean } | null = null;

  private readonly parser = new FrameParser((frame) => this.handle(frame));

  constructor(private readonly reply: (bytes: Uint8Array) => void) {}

  /** Ramka bez żądania (TELEMETRY, EVENT, LOG, AMP_OUT) — SEQ = 0 jak w firmware. */
  sendUnsolicited<T extends DescMessage>(
    command: number,
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
      case Command.START_SESSION: {
        const { appId } = fromBinary(StartSessionRequestSchema, frame.payload);
        if (!this.knownAppIds.includes(appId)) {
          this.sessionActive = false;
          this.respond(frame, StartSessionResponseSchema, { status: Status.UNKNOWN_APP });
          return;
        }
        this.sessionAppId = appId;
        this.sessionActive = this.startSessionStatus === Status.OK;
        this.update = null; // nowa sesja kończy aktualizację
        this.respond(frame, StartSessionResponseSchema, {
          status: this.startSessionStatus,
          protocolVersionMajor: 1,
          protocolVersionMinor: this.protocolMinor,
          sessionTimeoutMs: this.sessionTimeoutMs,
        });
        return;
      }
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

    // Jak AppProtocol::isUserCommand(): komendy technika są dla aplikacji użytkownika nieznane
    if (this.sessionAppId === USER_APP_ID && !USER_COMMANDS.has(frame.command)) {
      this.error(frame, Status.UNKNOWN_COMMAND);
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
      case Command.GET_LOGICS: {
        const config = this.configuration;
        this.respond(frame, GetLogicsResponseSchema, {
          logics: config.logics.map((logic) => clone(LogicSchema, logic)),
          defaultLogicIndex: config.defaultLogicIndex,
          selectorSignal: config.selectorSignal,
          signalNames: config.signals.map((signal) => signal.name),
          unsavedChanges: this.unsavedChanges,
        });
        return;
      }
      case Command.SET_LOGICS: {
        const request = fromBinary(SetLogicsRequestSchema, frame.payload);
        if (this.rejectLogics !== LogicError.UNSPECIFIED || request.logics.length === 0) {
          this.respond(frame, SetLogicsResponseSchema, {
            status: Status.INVALID_CONFIGURATION,
            error:
              this.rejectLogics !== LogicError.UNSPECIFIED
                ? this.rejectLogics
                : LogicError.NO_LOGIC,
          });
          return;
        }
        this.configuration = clone(ConfigurationSchema, this.configuration);
        this.configuration.logics = request.logics;
        this.configuration.defaultLogicIndex = request.defaultLogicIndex;
        this.unsavedChanges = !(request.save && this.saveStatus === Status.OK);
        this.respond(frame, SetLogicsResponseSchema, {
          status: request.save ? this.saveStatus : Status.OK,
        });
        return;
      }
      case TechnicianCommand.GET_CONFIGURATION:
        this.respond(frame, GetConfigurationResponseSchema, {
          configuration: clone(ConfigurationSchema, this.configuration),
          unsavedChanges: this.unsavedChanges,
        });
        return;
      case TechnicianCommand.SET_CONFIGURATION: {
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
        this.applyFlapOutputs(configuration);
        this.configuration = configuration;
        this.unsavedChanges = true;
        this.respond(frame, SetConfigurationResponseSchema, { status: Status.OK });
        return;
      }
      case TechnicianCommand.SAVE_CONFIGURATION:
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
      case Command.SET_FLAPS_OVERRIDE: {
        const { state, durationMs, permanent } = fromBinary(
          SetFlapsOverrideRequestSchema,
          frame.payload,
        );
        const ending = state === FlapsState.UNSPECIFIED;
        if (!ending && !permanent && (durationMs < 1 || durationMs > 600_000)) {
          this.respond(frame, SetFlapsOverrideResponseSchema, { status: Status.INVALID_OVERRIDE });
          return;
        }
        this.state.overrideState = state;
        this.state.overrideRemainingMs = ending || permanent ? 0 : durationMs;
        this.state.overridePermanent = !ending && permanent;
        this.respond(frame, SetFlapsOverrideResponseSchema, { status: Status.OK });
        return;
      }
      case TechnicianCommand.CAN_SNIFF_START: {
        const request = fromBinary(CanSniffStartRequestSchema, frame.payload);
        const valid = request.durationMs <= 3_600_000;
        this.sniff = valid ? { allFrames: request.allFrames } : this.sniff;
        this.respond(frame, CanSniffStartResponseSchema, {
          status: valid ? Status.OK : Status.INVALID_SNIFF,
        });
        return;
      }
      case TechnicianCommand.CAN_SNIFF_STOP:
        this.sniff = null;
        this.respond(frame, CanSniffStopResponseSchema, { frames: 3, dropped: 1 });
        return;
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

  /**
   * Jak FlapsBridgeController::setConnected / setReversed: zmiana wyjścia zapomina pozycję
   * (odłączone = NOT_CONNECTED), bez EVENT.
   */
  private applyFlapOutputs(next: Configuration): void {
    const position = (
      before: Configuration['flap1'],
      after: Configuration['flap1'],
      current: FlapPosition,
    ): FlapPosition => {
      if (after?.disconnected) {
        return FlapPosition.NOT_CONNECTED;
      }
      const changed =
        !!before?.disconnected !== !!after?.disconnected ||
        !!before?.reversed !== !!after?.reversed;
      return changed ? FlapPosition.UNKNOWN : current;
    };
    this.state.flap1 = position(this.configuration.flap1, next.flap1, this.state.flap1);
    this.state.flap2 = position(this.configuration.flap2, next.flap2, this.state.flap2);
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
