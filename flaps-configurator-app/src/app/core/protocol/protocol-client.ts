import {
  create,
  DescMessage,
  fromBinary,
  MessageInitShape,
  MessageShape,
  toBinary,
} from '@bufbuild/protobuf';
import { encodeFrame, Frame } from './frame';
import { Command, ErrorResponseSchema, Status } from './gen/flaps_common_pb';

export const PROTOCOL_VERSION_MAJOR = 1;
export const PROTOCOL_VERSION_MINOR = 15;

/** Bit odpowiedzi w CMD (START_SESSION 0x01 -> 0x81). */
export const RESPONSE_BIT = 0x80;

const UNSOLICITED_FIRST = 0x70;
const UNSOLICITED_LAST = 0x7f;

/** Urządzenie odpowiedziało ramką ERROR. */
export class ProtocolError extends Error {
  constructor(readonly status: Status) {
    super(`Device error: ${Status[status] ?? status}`);
    this.name = 'ProtocolError';
  }
}

/** Brak odpowiedzi mimo ponowień. */
export class ProtocolTimeoutError extends Error {
  /** Numer komendy (Command albo TechnicianCommand aplikacji technika). */
  constructor(readonly command: number) {
    super(`No response to ${Command[command] ?? `0x${command.toString(16)}`}`);
    this.name = 'ProtocolTimeoutError';
  }
}

export interface ProtocolClientOptions {
  /** Czas oczekiwania na odpowiedź na jedną próbę. */
  timeoutMs?: number;
  /** Liczba ponowień po timeoucie (każde z nowym SEQ). */
  retries?: number;
  /** Każda wysyłana ramka (log w Dev console). */
  onSend?: (frame: Frame) => void;
}

interface PendingRequest {
  command: number;
  resolve: (payload: Uint8Array) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Klient protokołu: numeruje SEQ, paruje odpowiedzi z żądaniami, ponawia po timeoucie
 * i zamienia ERROR na ProtocolError. Ramki wysyła przez przekazaną funkcję, odebrane
 * dostaje przez handleFrame() — nie wie nic o BLE.
 */
export class ProtocolClient {
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly onSend?: (frame: Frame) => void;
  private readonly pending = new Map<number, PendingRequest>();
  private seq = 0;

  constructor(
    private readonly send: (bytes: Uint8Array) => Promise<void>,
    options: ProtocolClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 500;
    this.retries = options.retries ?? 2;
    this.onSend = options.onSend;
  }

  async request<Req extends DescMessage, Res extends DescMessage>(
    command: number,
    requestSchema: Req,
    request: MessageInitShape<Req>,
    responseSchema: Res,
    options: ProtocolClientOptions = {},
  ): Promise<MessageShape<Res>> {
    const payload = toBinary(requestSchema, create(requestSchema, request));
    const retries = options.retries ?? this.retries;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;

    for (let attempt = 0; ; attempt++) {
      try {
        const reply = await this.sendOnce(command, payload, timeoutMs);
        return fromBinary(responseSchema, reply);
      } catch (error) {
        if (!(error instanceof ProtocolTimeoutError) || attempt >= retries) {
          throw error;
        }
      }
    }
  }

  /** Ramka odebrana z urządzenia (z FrameParser). */
  handleFrame(frame: Frame): void {
    if (frame.command >= UNSOLICITED_FIRST && frame.command <= UNSOLICITED_LAST) {
      return; // wiadomości bez żądania (logi, stan nRF52) — jeszcze nieobsługiwane
    }

    const pending = this.pending.get(frame.seq);
    if (!pending) {
      return; // spóźniona odpowiedź na porzuconą próbę
    }

    if (frame.command === Command.ERROR) {
      const { status } = fromBinary(ErrorResponseSchema, frame.payload);
      this.settle(frame.seq);
      pending.reject(new ProtocolError(status));
    } else if (frame.command === (pending.command | RESPONSE_BIT)) {
      this.settle(frame.seq);
      pending.resolve(frame.payload);
    }
  }

  /** Odrzuca wszystkie oczekujące żądania (np. po utracie połączenia). */
  cancelAll(reason: Error): void {
    for (const [seq, pending] of this.pending) {
      this.settle(seq);
      pending.reject(reason);
    }
  }

  private sendOnce(command: number, payload: Uint8Array, timeoutMs: number): Promise<Uint8Array> {
    const seq = this.nextSeq();

    return new Promise<Uint8Array>((resolve, reject) => {
      const request: PendingRequest = { command, resolve, reject };
      this.pending.set(seq, request);

      const frame: Frame = { command, seq, payload };
      this.onSend?.(frame);
      // Czas na odpowiedź liczony od końca wysyłania: przy małym MTU (Web Bluetooth,
      // 20 B na zapis) sama wysyłka dużej ramki trwa dłużej niż timeout.
      this.send(encodeFrame(frame)).then(
        () => {
          if (this.pending.get(seq) === request) {
            request.timer = setTimeout(() => {
              this.settle(seq);
              reject(new ProtocolTimeoutError(command));
            }, timeoutMs);
          }
        },
        (error: unknown) => {
          this.settle(seq);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  private settle(seq: number): void {
    const pending = this.pending.get(seq);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(seq);
    }
  }

  private nextSeq(): number {
    this.seq = (this.seq + 1) & 0xff;
    return this.seq;
  }
}
