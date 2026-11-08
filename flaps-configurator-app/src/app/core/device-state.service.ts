import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { clone, create, DescMessage, fromBinary, MessageShape } from '@bufbuild/protobuf';
import { ConnectionService } from './connection.service';
import { Frame } from './protocol/frame';
import {
  Command,
  DeviceState,
  DeviceStateSchema,
  Event,
  EventSchema,
  FlapPosition,
  FlapsState,
  FlapTrace,
  FlapTraceSchema,
  GetStateRequestSchema,
  GetStateResponseSchema,
  Log,
  LogLevel,
  LogSchema,
  SetDevModeRequestSchema,
  SetDevModeResponseSchema,
  SetFlapsOverrideRequestSchema,
  SetFlapsOverrideResponseSchema,
  Status,
  Telemetry,
  TelemetrySchema,
} from './protocol/gen/flaps_pb';

/** Najdłuższe ręczne sterowanie przyjmowane przez firmware (FlapsOverride::MaxOverrideMs). */
export const MAX_OVERRIDE_MS = 600_000;

export interface FlapTraceData {
  /** Próbka i została pobrana interval_ms * i od startu ruchu. */
  intervalMs: number;
  /** Surowe AMP_OUT (16-bit ADC). */
  samples: number[];
}

/** Ruch klapy: diagnostyka z EVENT flap_move_finished i przebieg z FLAP_TRACE (tryb dev). */
export interface FlapMove {
  id: number;
  time: string;
  flap: number;
  /** Kierunek ruchu: OPEN albo CLOSED. */
  position: FlapPosition;
  durationMs: number | null;
  peakAmpOut: number | null;
  ampOutAtStop: number | null;
  trace: FlapTraceData | null;
}

export interface DeviceLogLine {
  id: number;
  uptimeMs: number;
  level: LogLevel;
  text: string;
}

export interface DevModeSettings {
  logLevel: LogLevel;
  flapTrace: boolean;
}

const LOG_LIMIT = 300;
const MOVE_LIMIT = 30;

/**
 * Stan sterownika na żywo (README firmware, „Stan i telemetria”): GET_STATE po każdym starcie
 * sesji, potem zmiany z TELEMETRY / EVENT. Ręczne sterowanie klapami (SET_FLAPS_OVERRIDE)
 * i tryb dev (SET_DEV_MODE: logi, przebieg AMP_OUT).
 */
@Injectable({ providedIn: 'root' })
export class DeviceStateService {
  private readonly connection = inject(ConnectionService);

  private readonly _state = signal<DeviceState | null>(null);
  /** Kiedy (Date.now) kończy się ręczne sterowanie. */
  private readonly _overrideUntil = signal<number | null>(null);
  private readonly _devMode = signal<DevModeSettings>({
    logLevel: LogLevel.OFF,
    flapTrace: false,
  });
  private readonly _logs = signal<DeviceLogLine[]>([]);
  private readonly _droppedLogs = signal(0);
  private readonly _moves = signal<FlapMove[]>([]);
  private readonly _error = signal<string | null>(null);

  /** Pełny stan; null przed GET_STATE i bez połączenia. */
  readonly state = this._state.asReadonly();
  readonly overrideUntil = this._overrideUntil.asReadonly();
  readonly devMode = this._devMode.asReadonly();
  readonly devModeEnabled = computed(
    () => this._devMode().logLevel !== LogLevel.OFF || this._devMode().flapTrace,
  );
  /** Logi sterownika (tryb dev), od najstarszych. */
  readonly logs = this._logs.asReadonly();
  /** Linie utracone po stronie sterownika (pełny bufor). */
  readonly droppedLogs = this._droppedLogs.asReadonly();
  /** Ostatnie ruchy klap, od najnowszego. */
  readonly moves = this._moves.asReadonly();
  /** Powód ostatniej nieudanej operacji (stan, tryb dev). */
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
      const connected = this.connection.connected();
      untracked(() => {
        if (connected && session > 0) {
          // Nowa sesja: urządzenie wyłączyło tryb dev i czeka z raportami na GET_STATE
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

  /** Tryb dev obowiązuje do końca sesji — aplikacja włącza go ponownie w każdej nowej. */
  async setDevMode(settings: DevModeSettings): Promise<void> {
    this._devMode.set(settings);
    if (this.connection.connected()) {
      await this.applyDevMode();
    }
  }

  clearLogs(): void {
    this._logs.set([]);
    this._droppedLogs.set(0);
  }

  clearMoves(): void {
    this._moves.set([]);
  }

  private async startSession(): Promise<void> {
    try {
      await this.refresh();
      if (this.devModeEnabled()) {
        await this.applyDevMode();
      }
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

  private async applyDevMode(): Promise<void> {
    const { logLevel, flapTrace } = this._devMode();
    await this.connection.request(
      Command.SET_DEV_MODE,
      SetDevModeRequestSchema,
      { logLevel, flapTrace },
      SetDevModeResponseSchema,
    );
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
      case Command.FLAP_TRACE: {
        const trace = decode(FlapTraceSchema, frame.payload);
        if (trace) {
          this.applyTrace(trace);
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
        return;
      case 'flapMoveFinished':
        this.updateState((state) => setFlap(state, value.flap, value.position));
        this.addMove({
          flap: value.flap,
          position: value.position,
          durationMs: value.durationMs,
          peakAmpOut: value.peakAmpOut,
          ampOutAtStop: value.ampOutAtStop,
          trace: null,
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

  /** FLAP_TRACE przychodzi po EVENT flap_move_finished tego samego ruchu. */
  private applyTrace(trace: FlapTrace): void {
    const data: FlapTraceData = { intervalMs: trace.intervalMs, samples: [...trace.samples] };
    const moves = this._moves();
    const index = moves.findIndex(
      (move) => move.flap === trace.flap && move.position === trace.position && !move.trace,
    );
    if (index >= 0) {
      this._moves.set(moves.map((move, i) => (i === index ? { ...move, trace: data } : move)));
      return;
    }
    this.addMove({
      flap: trace.flap,
      position: trace.position,
      durationMs: null,
      peakAmpOut: null,
      ampOutAtStop: null,
      trace: data,
    });
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
