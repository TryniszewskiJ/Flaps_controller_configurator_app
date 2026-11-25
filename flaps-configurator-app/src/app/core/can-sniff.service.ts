import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { fromBinary } from '@bufbuild/protobuf';
import { ConnectionService } from './connection.service';
import { Frame } from './protocol/frame';
import {
  CanSniff,
  CanSniffSchema,
  CanSniffStartRequestSchema,
  CanSniffStartResponseSchema,
  CanSniffStopRequestSchema,
  CanSniffStopResponseSchema,
  Status,
  TechnicianCommand,
} from './protocol/messages';
import { ProtocolError, ProtocolTimeoutError } from './protocol/protocol-client';

/** Podsłuch CAN jest od protokołu 1.14. */
export const CAN_SNIFF_MINOR = 14;
/** Ile ostatnich ramek trzyma historia (starsze wypadają). */
export const CAN_SNIFF_HISTORY = 2000;

/** Odebrana ramka CAN z podsłuchu. */
export interface SniffedFrame {
  id: number;
  /** µs od CAN_SNIFF_START (z chwili odbioru w sterowniku). */
  timeUs: number;
  canId: number;
  extendedId: boolean;
  data: Uint8Array;
}

/** Ostatnia ramka danego ID (widok „Ostatnie”). */
export interface LatestFrame {
  key: string;
  frame: SniffedFrame;
  count: number;
  /** Odstęp od poprzedniej ramki tego ID; null przy pierwszej. */
  periodUs: number | null;
  /** Bajty zmienione względem poprzedniej ramki tego ID. */
  changed: boolean[];
}

export interface SniffSummary {
  frames: number;
  dropped: number;
}

/**
 * Podsłuch magistrali CAN (CAN_SNIFF_START / STOP i paczki CAN_SNIFF): historia ramek i ostatnia
 * ramka każdego ID. Ponowny start zaczyna od zera; podsłuch kończy się z sesją.
 */
@Injectable({ providedIn: 'root' })
export class CanSniffService {
  private readonly connection = inject(ConnectionService);

  private readonly _active = signal(false);
  private readonly _busy = signal(false);
  private readonly _history = signal<SniffedFrame[]>([]);
  private readonly _latest = signal<Map<string, LatestFrame>>(new Map());
  private readonly _received = signal(0);
  private readonly _dropped = signal(0);
  private readonly _summary = signal<SniffSummary | null>(null);
  private readonly _error = signal<string | null>(null);
  private nextId = 0;

  readonly active = this._active.asReadonly();
  /** Trwa START albo STOP. */
  readonly busy = this._busy.asReadonly();
  /** Ostatnie CAN_SNIFF_HISTORY ramek, od najstarszej. */
  readonly history = this._history.asReadonly();
  /** Ostatnia ramka każdego ID, po ID rosnąco. */
  readonly latest = computed(() =>
    [...this._latest().values()].sort(
      (a, b) =>
        Number(a.frame.extendedId) - Number(b.frame.extendedId) || a.frame.canId - b.frame.canId,
    ),
  );
  /** Ramki odebrane w aplikacji od startu. */
  readonly received = this._received.asReadonly();
  /** Ramki utracone po drodze (pełny bufor sterownika, wolny link). */
  readonly dropped = this._dropped.asReadonly();
  /** Odpowiedź CAN_SNIFF_STOP. */
  readonly summary = this._summary.asReadonly();
  readonly error = this._error.asReadonly();

  readonly supported = computed(
    () => (this.connection.protocolMinor() ?? CAN_SNIFF_MINOR) >= CAN_SNIFF_MINOR,
  );

  constructor() {
    this.connection.onUnsolicited((frame) => this.handle(frame));

    // Sterownik kończy podsłuch z sesją i przy nowym START_SESSION
    effect(() => {
      this.connection.session();
      this.connection.application();
      untracked(() => this._active.set(false));
    });
  }

  /** Start od zera: `allFrames` — cała magistrala, inaczej tylko ramki z konfiguracji. */
  async start(allFrames: boolean): Promise<void> {
    this._busy.set(true);
    this._error.set(null);
    try {
      const reply = await this.connection.request(
        TechnicianCommand.CAN_SNIFF_START,
        CanSniffStartRequestSchema,
        { allFrames, durationMs: 0 },
        CanSniffStartResponseSchema,
      );
      if (reply.status !== Status.OK) {
        throw new Error(
          reply.status === Status.BUSY
            ? 'Sterownik jest zajęty (aktualizacja firmware).'
            : `Sterownik odrzucił podsłuch (${Status[reply.status] ?? reply.status}).`,
        );
      }
      this.reset();
      this._active.set(true);
    } catch (error) {
      this._error.set(describeError(error));
    } finally {
      this._busy.set(false);
    }
  }

  async stop(): Promise<void> {
    this._busy.set(true);
    this._error.set(null);
    try {
      const reply = await this.connection.request(
        TechnicianCommand.CAN_SNIFF_STOP,
        CanSniffStopRequestSchema,
        {},
        CanSniffStopResponseSchema,
      );
      this._summary.set({ frames: reply.frames, dropped: reply.dropped });
    } catch (error) {
      this._error.set(describeError(error));
    } finally {
      this._active.set(false);
      this._busy.set(false);
    }
  }

  private handle(frame: Frame): void {
    if (frame.command !== TechnicianCommand.CAN_SNIFF || !this._active()) {
      return;
    }
    let message: CanSniff;
    try {
      message = fromBinary(CanSniffSchema, frame.payload);
    } catch {
      return;
    }
    const frames = message.frames.map<SniffedFrame>((f) => ({
      id: this.nextId++,
      timeUs: f.timeUs,
      canId: f.id,
      extendedId: f.extendedId,
      data: f.data,
    }));

    this._dropped.update((dropped) => dropped + message.dropped);
    this._received.update((received) => received + frames.length);
    this._history.update((history) => [...history, ...frames].slice(-CAN_SNIFF_HISTORY));
    this._latest.update((latest) => {
      const next = new Map(latest);
      for (const f of frames) {
        const key = `${f.extendedId ? 'x' : 's'}${f.canId}`;
        const previous = next.get(key);
        next.set(key, {
          key,
          frame: f,
          count: (previous?.count ?? 0) + 1,
          periodUs: previous ? (f.timeUs - previous.frame.timeUs) >>> 0 : null,
          changed: Array.from(f.data, (byte, i) => !!previous && previous.frame.data[i] !== byte),
        });
      }
      return next;
    });
  }

  private reset(): void {
    this._history.set([]);
    this._latest.set(new Map());
    this._received.set(0);
    this._dropped.set(0);
    this._summary.set(null);
  }
}

function describeError(error: unknown): string {
  if (error instanceof ProtocolTimeoutError) {
    return 'Urządzenie nie odpowiada.';
  }
  if (error instanceof ProtocolError) {
    return error.status === Status.UNKNOWN_COMMAND
      ? 'Firmware sterownika nie ma podsłuchu CAN — zaktualizuj je (protokół 1.14).'
      : `Urządzenie zwróciło błąd (${Status[error.status] ?? error.status}).`;
  }
  return error instanceof Error ? error.message : String(error);
}
