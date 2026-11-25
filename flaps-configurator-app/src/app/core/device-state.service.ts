import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { clone, create, DescMessage, fromBinary, MessageShape } from '@bufbuild/protobuf';
import { ConnectionService } from './connection.service';
import { Frame } from './protocol/frame';
import { Command, FlapsState, Status } from './protocol/gen/flaps_common_pb';
import {
  DeviceState,
  DeviceStateSchema,
  Event,
  EventSchema,
  FlapPosition,
  GetStateRequestSchema,
  GetStateResponseSchema,
  SetFlapsOverrideRequestSchema,
  SetFlapsOverrideResponseSchema,
  Telemetry,
  TelemetrySchema,
} from './protocol/gen/flaps_state_pb';
import { t } from './i18n/i18n';

/** Najdłuższe ręczne sterowanie przyjmowane przez firmware (FlapsOverride::MaxOverrideMs). */
export const MAX_OVERRIDE_MS = 600_000;

/** Stałe ręczne sterowanie (do oddania albo resetu sterownika) jest od protokołu 1.15. */
export const PERMANENT_OVERRIDE_MINOR = 15;

/** Czas ręcznego sterowania w ms albo 'permanent' — do oddania sterowania lub resetu sterownika. */
export type OverrideDuration = number | 'permanent';

/**
 * Stan sterownika na żywo (README firmware, „Stan i telemetria”): GET_STATE po każdym starcie
 * sesji, potem zmiany z TELEMETRY / EVENT. Ręczne sterowanie klapami (SET_FLAPS_OVERRIDE).
 * Wspólne dla obu aplikacji — diagnostyka technika (logi, AMP_OUT, ruchy) jest w
 * DevTelemetryService.
 */
@Injectable({ providedIn: 'root' })
export class DeviceStateService {
  private readonly connection = inject(ConnectionService);

  private readonly _state = signal<DeviceState | null>(null);
  /** Kiedy (Date.now) kończy się ręczne sterowanie; null także przy stałym. */
  private readonly _overrideUntil = signal<number | null>(null);
  private readonly _error = signal<string | null>(null);

  /** Pełny stan; null przed GET_STATE i bez połączenia. */
  readonly state = this._state.asReadonly();
  readonly overrideUntil = this._overrideUntil.asReadonly();
  /** Powód ostatniej nieudanej operacji (odczyt stanu). */
  readonly error = this._error.asReadonly();
  /** Kierunek ręcznego sterowania; null — klapy słuchają logiki. */
  readonly override = computed(() => {
    const state = this._state();
    return state && state.overrideState !== FlapsState.UNSPECIFIED ? state.overrideState : null;
  });
  /** Ręczne sterowanie bez limitu czasu — trwa do oddania albo resetu sterownika. */
  readonly overridePermanent = computed(
    () => this.override() !== null && !!this._state()?.overridePermanent,
  );
  /** Firmware zna stałe ręczne sterowanie (protokół 1.15). */
  readonly permanentOverrideSupported = computed(
    () => (this.connection.protocolMinor() ?? 0) >= PERMANENT_OVERRIDE_MINOR,
  );

  /** Ostatni `sequence` z TELEMETRY / EVENT (wspólny licznik); null przed GET_STATE. */
  private sequence: number | null = null;
  private refreshing: Promise<void> | null = null;

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

  /**
   * Otwiera albo zamyka klapy zamiast logiki (także w stanie bezpiecznym) na `duration` ms albo
   * na stałe ('permanent') — do oddania sterowania albo resetu sterownika.
   */
  async setOverride(
    state: FlapsState.OPEN | FlapsState.CLOSED,
    duration: OverrideDuration,
  ): Promise<void> {
    const permanent = duration === 'permanent';
    const durationMs = permanent ? 0 : duration;
    if (permanent && !this.permanentOverrideSupported()) {
      throw new Error(t('deviceState.noPermanent'));
    }
    await this.sendOverride(state, durationMs, permanent);
    // Przedłużenie tym samym stanem nie jest zdarzeniem — czas znamy z żądania
    this.updateState((current) => {
      current.overrideState = state;
      current.overrideRemainingMs = durationMs;
      current.overridePermanent = permanent;
    });
    this.setOverrideUntil(state, durationMs, permanent);
  }

  /** Kończy ręczne sterowanie — klapy wracają do logiki. */
  async releaseOverride(): Promise<void> {
    await this.sendOverride(FlapsState.UNSPECIFIED, 0, false);
    this.updateState((current) => {
      current.overrideState = FlapsState.UNSPECIFIED;
      current.overrideRemainingMs = 0;
      current.overridePermanent = false;
    });
    this.setOverrideUntil(FlapsState.UNSPECIFIED, 0, false);
  }

  private async startSession(): Promise<void> {
    try {
      await this.refresh();
      this._error.set(null);
    } catch {
      this._error.set(t('deviceState.readFailed'));
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
    this.setOverrideUntil(state.overrideState, state.overrideRemainingMs, state.overridePermanent);
  }

  private async sendOverride(
    state: FlapsState,
    durationMs: number,
    permanent: boolean,
  ): Promise<void> {
    const reply = await this.connection.request(
      Command.SET_FLAPS_OVERRIDE,
      SetFlapsOverrideRequestSchema,
      { state, durationMs, permanent },
      SetFlapsOverrideResponseSchema,
    );
    if (reply.status !== Status.OK) {
      throw new Error(t('deviceState.overrideRejected'));
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
      case 'flapMoveFinished':
        this.updateState((state) => setFlap(state, value.flap, value.position));
        return;
      case 'flapsOverrideChanged':
        this.updateState((state) => {
          state.overrideState = value.state;
          state.overrideRemainingMs = value.remainingMs;
          state.overridePermanent = value.permanent;
        });
        this.setOverrideUntil(value.state, value.remainingMs, value.permanent);
        return;
    }
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

  private setOverrideUntil(state: FlapsState, remainingMs: number, permanent: boolean): void {
    this._overrideUntil.set(
      state === FlapsState.UNSPECIFIED || permanent ? null : Date.now() + remainingMs,
    );
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
