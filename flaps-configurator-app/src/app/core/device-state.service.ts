import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { clone, create, DescMessage, fromBinary, MessageShape } from '@bufbuild/protobuf';
import { ConnectionService } from './connection.service';
import { Frame } from './protocol/frame';
import {
  AmpOut,
  AmpOutSchema,
  Command,
  DeviceState,
  DeviceStateSchema,
  Event,
  EventSchema,
  FlapPosition,
  FlapsState,
  FlapStopReason,
  GetStateRequestSchema,
  GetStateResponseSchema,
  Log,
  LogLevel,
  LogSchema,
  SetFlapsOverrideRequestSchema,
  SetFlapsOverrideResponseSchema,
  Status,
  Telemetry,
  TelemetrySchema,
} from './protocol/gen/flaps_pb';

/** Najdłuższe ręczne sterowanie przyjmowane przez firmware (FlapsOverride::MaxOverrideMs). */
export const MAX_OVERRIDE_MS = 600_000;

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
 * Stan sterownika na żywo (README firmware, „Stan i telemetria”): GET_STATE po każdym starcie
 * sesji, potem zmiany z TELEMETRY / EVENT. Ręczne sterowanie klapami (SET_FLAPS_OVERRIDE)
 * oraz to, co wysyła tryb dev z konfiguracji: logi (LOG) i AMP_OUT na żywo.
 */
@Injectable({ providedIn: 'root' })
export class DeviceStateService {
  private readonly connection = inject(ConnectionService);

  private readonly _state = signal<DeviceState | null>(null);
  /** Kiedy (Date.now) kończy się ręczne sterowanie. */
  private readonly _overrideUntil = signal<number | null>(null);
  private readonly _logs = signal<DeviceLogLine[]>([]);
  private readonly _droppedLogs = signal(0);
  private readonly _moves = signal<FlapMove[]>([]);
  private readonly _ampOut = signal<AmpOutSample[]>([]);
  private readonly _moveMarks = signal<FlapMoveMark[]>([]);
  private readonly _error = signal<string | null>(null);

  /** Pełny stan; null przed GET_STATE i bez połączenia. */
  readonly state = this._state.asReadonly();
  readonly overrideUntil = this._overrideUntil.asReadonly();
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
  /** Powód ostatniej nieudanej operacji (odczyt stanu). */
  readonly error = this._error.asReadonly();
  /** Kierunek ręcznego sterowania; null — klapy słuchają logiki. */
  readonly override = computed(() => {
    const state = this._state();
    return state && state.overrideState !== FlapsState.UNSPECIFIED ? state.overrideState : null;
  });

  /** Ostatni `sequence` z TELEMETRY / EVENT (wspólny licznik); null przed GET_STATE. */
  private sequence: number | null = null;
  private refreshing: Promise<void> | null = null;
  private nextId = 0;

  constructor() {
    this.connection.onUnsolicited((frame) => this.handle(frame));

    effect(() => {
      const session = this.connection.session();
      const connected = this.connection.application();
      untracked(() => {
        if (connected && session > 0) {
          // Nowa sesja: urządzenie czeka z raportami na GET_STATE
          void this.startSession();
        } else if (!connected) {
          this.resetState();
        }
      });
    });
  }

  /** GET_STATE — cały stan od nowa (po starcie sesji albo luce w numeracji). */
  refresh(): Promise<void> {
    this.refreshing ??= this.loadState().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** Otwiera albo zamyka klapy na `durationMs` zamiast logiki (także w stanie bezpiecznym). */
  async setOverride(state: FlapsState.OPEN | FlapsState.CLOSED, durationMs: number): Promise<void> {
    await this.sendOverride(state, durationMs);
    // Przedłużenie tym samym stanem nie jest zdarzeniem — czas znamy z żądania
    this.updateState((current) => {
      current.overrideState = state;
      current.overrideRemainingMs = durationMs;
    });
    this.setOverrideUntil(state, durationMs);
  }

  /** Kończy ręczne sterowanie — klapy wracają do logiki. */
  async releaseOverride(): Promise<void> {
    await this.sendOverride(FlapsState.UNSPECIFIED, 0);
    this.updateState((current) => {
      current.overrideState = FlapsState.UNSPECIFIED;
      current.overrideRemainingMs = 0;
    });
    this.setOverrideUntil(FlapsState.UNSPECIFIED, 0);
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

  private async startSession(): Promise<void> {
    try {
      await this.refresh();
      this._error.set(null);
    } catch {
      this._error.set('Nie udało się odczytać stanu sterownika.');
    }
  }

  private async loadState(): Promise<void> {
    const reply = await this.connection.request(
      Command.GET_STATE,
      GetStateRequestSchema,
      {},
      GetStateResponseSchema,
    );
    const state = reply.state ?? create(DeviceStateSchema);
    this.sequence = reply.sequence;
    this._state.set(state);
    this.setOverrideUntil(state.overrideState, state.overrideRemainingMs);
  }

  private async sendOverride(state: FlapsState, durationMs: number): Promise<void> {
    const reply = await this.connection.request(
      Command.SET_FLAPS_OVERRIDE,
      SetFlapsOverrideRequestSchema,
      { state, durationMs },
      SetFlapsOverrideResponseSchema,
    );
    if (reply.status !== Status.OK) {
      throw new Error('Sterownik odrzucił ręczne sterowanie (niepoprawny stan albo czas).');
    }
  }

  private handle(frame: Frame): void {
    switch (frame.command) {
      case Command.TELEMETRY: {
        const telemetry = decode(TelemetrySchema, frame.payload);
        if (telemetry && this.acceptSequence(telemetry.sequence)) {
          this.applyTelemetry(telemetry);
        }
        return;
      }
      case Command.EVENT: {
        const event = decode(EventSchema, frame.payload);
        if (event && this.acceptSequence(event.sequence)) {
          this.applyEvent(event);
        }
        return;
      }
      case Command.LOG: {
        const log = decode(LogSchema, frame.payload);
        if (log) {
          this.applyLog(log);
        }
        return;
      }
      case Command.AMP_OUT: {
        const ampOut = decode(AmpOutSchema, frame.payload);
        if (ampOut) {
          this.applyAmpOut(ampOut);
        }
        return;
      }
    }
  }

  /**
   * TELEMETRY i EVENT mają wspólny licznik. Przed GET_STATE nic nie nakładamy; luka
   * w numeracji oznacza zgubioną ramkę — wtedy stan od nowa.
   */
  private acceptSequence(sequence: number): boolean {
    if (this._state() === null || this.sequence === null) {
      return false;
    }
    if (sequence <= this.sequence) {
      return false; // sprzed ostatniego GET_STATE
    }
    if (sequence !== this.sequence + 1) {
      void this.refresh().catch(() => undefined);
      return false;
    }
    this.sequence = sequence;
    return true;
  }

  private applyTelemetry(telemetry: Telemetry): void {
    this.updateState((state) => {
      for (const signalState of telemetry.signals) {
        const index = state.signals.findIndex((s) => s.index === signalState.index);
        if (index >= 0) {
          state.signals[index] = signalState;
        } else {
          state.signals.push(signalState);
        }
      }
    });
  }

  private applyEvent(event: Event): void {
    const { case: kind, value } = event.event;
    switch (kind) {
      case 'activeLogicChanged':
        this.updateState((state) => (state.activeLogic = value.activeLogic));
        return;
      case 'flapMoveStarted':
        this.updateState((state) => setFlap(state, value.flap, value.position));
        this.addMoveMark(event.uptimeMs, value.flap, value.position);
        return;
      case 'flapMoveFinished':
        this.updateState((state) => setFlap(state, value.flap, value.position));
        this.addMove({
          flap: value.flap,
          position: value.position,
          durationMs: value.durationMs,
          peakAmpOut: value.peakAmpOut,
          ampOutAtStop: value.ampOutAtStop,
          stopReason: value.stopReason,
        });
        return;
      case 'flapsOverrideChanged':
        this.updateState((state) => {
          state.overrideState = value.state;
          state.overrideRemainingMs = value.remainingMs;
        });
        this.setOverrideUntil(value.state, value.remainingMs);
        return;
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

  private updateState(change: (state: DeviceState) => void): void {
    const state = this._state();
    if (!state) {
      return;
    }
    const next = clone(DeviceStateSchema, state);
    change(next);
    this._state.set(next);
  }

  private setOverrideUntil(state: FlapsState, remainingMs: number): void {
    this._overrideUntil.set(state === FlapsState.UNSPECIFIED ? null : Date.now() + remainingMs);
  }

  private resetState(): void {
    this.sequence = null;
    this._state.set(null);
    this._overrideUntil.set(null);
  }
}

function setFlap(state: DeviceState, flap: number, position: FlapPosition): void {
  if (flap === 1) {
    state.flap1 = position;
  } else if (flap === 2) {
    state.flap2 = position;
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
