import { Injectable, inject } from '@angular/core';
import { signal } from '@angular/core';
import { DescMessage, fromBinary, MessageShape } from '@bufbuild/protobuf';
import { ConnectionService } from './connection.service';
import { Frame } from './protocol/frame';
import {
  AmpOut,
  AmpOutSchema,
  Command,
  Event,
  EventSchema,
  FlapPosition,
  FlapStopReason,
  Log,
  LogLevel,
  LogSchema,
  TechnicianCommand,
} from './protocol/messages';

/** Ruch klapy: diagnostyka z EVENT flap_move_finished. */
export interface FlapMove {
  id: number;
  time: string;
  flap: number;
  /** Kierunek ruchu: OPEN albo CLOSED. */
  position: FlapPosition;
  durationMs: number | null;
  peakAmpOut: number | null;
  ampOutAtStop: number | null;
  /** UNSPECIFIED = urządzenie < 1.11. */
  stopReason: FlapStopReason;
}

/** Próbka AMP_OUT obu klap (surowy 16-bit ADC) z chwili `uptimeMs` sterownika. */
export interface AmpOutSample {
  uptimeMs: number;
  flap1: number;
  flap2: number;
  /** Przed tą próbką brakuje próbek (zajęty link, zapis flasha) — wykres nie łączy ich linią. */
  gap: boolean;
}

/** Start ruchu klapy (EVENT flap_move_started) — znacznik na wykresie AMP_OUT. */
export interface FlapMoveMark {
  id: number;
  uptimeMs: number;
  flap: number;
  /** OPENING albo CLOSING. */
  position: FlapPosition;
}

export interface DeviceLogLine {
  id: number;
  uptimeMs: number;
  level: LogLevel;
  text: string;
}

const LOG_LIMIT = 300;
const MOVE_LIMIT = 30;
/** Ile historii AMP_OUT trzymamy (wg czasu sterownika) — do przewijania wykresu. */
export const AMP_OUT_HISTORY_MS = 5 * 60_000;

/**
 * Diagnostyka dla technika (Dev console): logi sterownika (LOG) i AMP_OUT na żywo z trybu dev
 * w konfiguracji oraz ruchy klap z EVENT (czas, prąd, powód zatrzymania). Stan klap i ręczne
 * sterowanie — wspólne z aplikacją użytkownika — są w DeviceStateService.
 */
@Injectable({ providedIn: 'root' })
export class DevTelemetryService {
  private readonly _logs = signal<DeviceLogLine[]>([]);
  private readonly _droppedLogs = signal(0);
  private readonly _moves = signal<FlapMove[]>([]);
  private readonly _ampOut = signal<AmpOutSample[]>([]);
  private readonly _moveMarks = signal<FlapMoveMark[]>([]);

  /** Logi sterownika (tryb dev), od najstarszych. */
  readonly logs = this._logs.asReadonly();
  /** Linie utracone po stronie sterownika (pełny bufor). */
  readonly droppedLogs = this._droppedLogs.asReadonly();
  /** Ostatnie ruchy klap, od najnowszego. */
  readonly moves = this._moves.asReadonly();
  /** AMP_OUT z ostatnich AMP_OUT_HISTORY_MS, od najstarszej próbki. */
  readonly ampOut = this._ampOut.asReadonly();
  /** Starty ruchów klap z tego samego okresu co ampOut. */
  readonly moveMarks = this._moveMarks.asReadonly();

  private nextId = 0;

  constructor() {
    inject(ConnectionService).onUnsolicited((frame) => this.handle(frame));
  }

  clearLogs(): void {
    this._logs.set([]);
    this._droppedLogs.set(0);
  }

  clearMoves(): void {
    this._moves.set([]);
  }

  clearAmpOut(): void {
    this._ampOut.set([]);
    this._moveMarks.set([]);
  }

  private handle(frame: Frame): void {
    switch (frame.command) {
      case Command.EVENT: {
        const event = decode(EventSchema, frame.payload);
        if (event) {
          this.applyEvent(event);
        }
        return;
      }
      case TechnicianCommand.LOG: {
        const log = decode(LogSchema, frame.payload);
        if (log) {
          this.applyLog(log);
        }
        return;
      }
      case TechnicianCommand.AMP_OUT: {
        const ampOut = decode(AmpOutSchema, frame.payload);
        if (ampOut) {
          this.applyAmpOut(ampOut);
        }
        return;
      }
    }
  }

  private applyEvent(event: Event): void {
    const { case: kind, value } = event.event;
    if (kind === 'flapMoveStarted') {
      this.addMoveMark(event.uptimeMs, value.flap, value.position);
    } else if (kind === 'flapMoveFinished') {
      this.addMove({
        flap: value.flap,
        position: value.position,
        durationMs: value.durationMs,
        peakAmpOut: value.peakAmpOut,
        ampOutAtStop: value.ampOutAtStop,
        stopReason: value.stopReason,
      });
    }
  }

  private applyLog(log: Log): void {
    const lines = log.entries.map((entry) => ({
      id: this.nextId++,
      uptimeMs: entry.uptimeMs,
      level: entry.level,
      text: entry.text,
    }));
    this._logs.update((logs) => [...logs, ...lines].slice(-LOG_LIMIT));
    this._droppedLogs.update((dropped) => dropped + log.dropped);
  }

  /** 5 próbek co interval_ms od uptime_ms; skok uptime_ms między ramkami = brakujące próbki. */
  private applyAmpOut(ampOut: AmpOut): void {
    const count = Math.min(ampOut.flap1.length, ampOut.flap2.length);
    if (count === 0) {
      return;
    }
    let samples = this._ampOut();
    const last = samples.at(-1);
    if (last && ampOut.uptimeMs <= last.uptimeMs) {
      // Czas sterownika się cofnął — reset sterownika, stara historia nie pasuje
      samples = [];
      this._moveMarks.set([]);
    }
    const previous = samples.at(-1);
    const gap = !!previous && ampOut.uptimeMs - previous.uptimeMs > ampOut.intervalMs * 1.5;
    const added: AmpOutSample[] = [];
    for (let i = 0; i < count; i++) {
      added.push({
        uptimeMs: ampOut.uptimeMs + ampOut.intervalMs * i,
        flap1: ampOut.flap1[i],
        flap2: ampOut.flap2[i],
        gap: i === 0 && gap,
      });
    }
    const since = added[added.length - 1].uptimeMs - AMP_OUT_HISTORY_MS;
    const first = samples.findIndex((sample) => sample.uptimeMs >= since);
    this._ampOut.set([...(first > 0 ? samples.slice(first) : first < 0 ? [] : samples), ...added]);
    this._moveMarks.update((marks) =>
      marks[0] && marks[0].uptimeMs < since ? marks.filter((m) => m.uptimeMs >= since) : marks,
    );
  }

  private addMoveMark(uptimeMs: number, flap: number, position: FlapPosition): void {
    const mark: FlapMoveMark = { id: this.nextId++, uptimeMs, flap, position };
    this._moveMarks.update((marks) => [...marks, mark]);
  }

  private addMove(move: Omit<FlapMove, 'id' | 'time'>): void {
    const entry: FlapMove = { ...move, id: this.nextId++, time: formatTime(new Date()) };
    this._moves.update((moves) => [entry, ...moves].slice(0, MOVE_LIMIT));
  }
}

function decode<T extends DescMessage>(schema: T, payload: Uint8Array): MessageShape<T> | null {
  try {
    return fromBinary(schema, payload);
  } catch {
    return null;
  }
}

function formatTime(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
