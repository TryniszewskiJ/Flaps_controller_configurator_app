import { create, DescMessage, MessageInitShape, toBinary } from '@bufbuild/protobuf';
import { encodeFrame, Frame, FrameParser } from '../protocol/frame';
import {
  CloseSessionResponseSchema,
  Command,
  ErrorResponseSchema,
  GetDeviceInfoResponseSchema,
  PingResponseSchema,
  StartSessionResponseSchema,
  Status,
} from '../protocol/gen/flaps_pb';

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
          protocolVersionMinor: 1,
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
