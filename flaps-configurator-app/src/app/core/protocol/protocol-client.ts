import {
  create,
  DescMessage,
  fromBinary,
  MessageInitShape,
  MessageShape,
  toBinary,
} from '@bufbuild/protobuf';
import { RESPONSE_BIT } from './commands';
import { encodeFrame, Frame } from './frame';
import { Command, ErrorResponseSchema, Status } from './gen/flaps_pb';

/** Stała aplikacji w StartSessionRequest ("FLAP"). */
export const APP_ID = 0x464c4150;
export const PROTOCOL_VERSION_MAJOR = 1;
export const PROTOCOL_VERSION_MINOR = 5;

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
  constructor(readonly command: Command) {
    super(`No response to ${Command[command] ?? command}`);
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
  command: Command;
  resolve: (payload: Uint8Array) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
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
    command: Command,
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

  private sendOnce(command: Command, payload: Uint8Array, timeoutMs: number): Promise<Uint8Array> {
    const seq = this.nextSeq();

    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settle(seq);
        reject(new ProtocolTimeoutError(command));
      }, timeoutMs);
      this.pending.set(seq, { command, resolve, reject, timer });

      const frame: Frame = { command, seq, payload };
      this.onSend?.(frame);
      this.send(encodeFrame(frame)).catch((error: unknown) => {
        this.settle(seq);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
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
