import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DescMessage,
  fromJson,
  JsonValue,
  MessageInitShape,
  MessageShape,
} from '@bufbuild/protobuf';
import { BleLinkService, FoundDevice } from './ble/ble-link.service';
import { FrameLogService } from './frame-log.service';
import { COMMAND_SCHEMAS } from './protocol/commands';
import { FrameParser } from './protocol/frame';
import {
  CloseSessionRequestSchema,
  CloseSessionResponseSchema,
  Command,
  GetDeviceInfoRequestSchema,
  GetDeviceInfoResponseSchema,
  PingRequestSchema,
  PingResponseSchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
  Status,
} from './protocol/gen/flaps_pb';
import {
  APP_ID,
  PROTOCOL_VERSION_MAJOR,
  PROTOCOL_VERSION_MINOR,
  ProtocolClient,
  ProtocolClientOptions,
  ProtocolError,
  ProtocolTimeoutError,
} from './protocol/protocol-client';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ConnectedDevice {
  deviceId: string;
  name: string;
}

export interface DeviceInfo {
  firmwareVersion: string;
  /** 96-bitowy UID MCU w hex. */
  uid: string;
}

export const DEFAULT_DEVICE_NAME = 'Sterownik klap';
export const RECONNECT_DELAY_MS = 2000;
const DEFAULT_SESSION_TIMEOUT_MS = 8000;
const MIN_PING_INTERVAL_MS = 1000;
const MAX_PING_FAILURES = 3;

/** Urządzenie odrzuciło sesję (inna wersja protokołu, obca aplikacja) — ponawianie nic nie da. */
class SessionRejectedError extends Error {}
/** Próba połączenia przerwana (Rozłącz / utrata łącza w trakcie). */
class ConnectionCancelledError extends Error {}

/**
 * Połączenie ze sterownikiem: BLE (mostek nRF52) + sesja protokołu STM32.
 * Utrzymuje połączenie (ping, ponowne łączenie), dopóki użytkownik nie wybierze "Rozłącz".
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private readonly link = inject(BleLinkService);
  private readonly frameLog = inject(FrameLogService);

  private readonly _status = signal<ConnectionStatus>('disconnected');
  private readonly _device = signal<ConnectedDevice | null>(null);
  private readonly _deviceInfo = signal<DeviceInfo | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly status = this._status.asReadonly();
  readonly device = this._device.asReadonly();
  readonly deviceInfo = this._deviceInfo.asReadonly();
  /** Powód ostatniego nieudanego połączenia. */
  readonly error = this._error.asReadonly();
  readonly connected = computed(() => this._status() === 'connected');
  readonly deviceName = computed(() => this._device()?.name ?? null);

  /** Użytkownik chce być połączony (od "Połącz" do "Rozłącz"). */
  private wanted = false;
  /** Zmienia się przy każdym połączeniu i jego końcu — unieważnia callbacki starych połączeń. */
  private generation = 0;
  private client: ProtocolClient | null = null;
  private readonly parser = new FrameParser((frame) => {
    this.frameLog.add('rx', frame);
    this.client?.handleFrame(frame);
  });
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingFailures = 0;

  async connect(device: FoundDevice): Promise<void> {
    if (this._status() !== 'disconnected') {
      await this.disconnect();
    }

    this.wanted = true;
    this._error.set(null);
    this._device.set({ deviceId: device.deviceId, name: device.name || DEFAULT_DEVICE_NAME });
    this._status.set('connecting');

    try {
      await this.open();
    } catch (error) {
      if (!this.wanted) {
        return; // anulowane przez disconnect()
      }
      this.fail(error);
      await this.link.disconnect().catch(() => undefined);
    }
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    const wasConnected = this._status() === 'connected';

    this.wanted = false;
    this.clearTimers();

    if (wasConnected && client) {
      // Urządzenie od razu kończy sesję zamiast czekać na timeout
      await client
        .request(Command.CLOSE_SESSION, CloseSessionRequestSchema, {}, CloseSessionResponseSchema, {
          retries: 0,
        })
        .catch(() => undefined);
    }

    this.generation++;
    client?.cancelAll(new ConnectionCancelledError('Disconnected'));
    this.client = null;
    await this.link.disconnect().catch(() => undefined);

    this._status.set('disconnected');
    this._device.set(null);
    this._deviceInfo.set(null);
  }

  /**
   * Komenda wpisana w Dev console: payload JSON w formacie modelu żądania z flaps.proto.
   * Odpowiedź widać w logu ramek; tu tylko błąd (brak połączenia, zły JSON, ERROR, timeout).
   */
  async sendCommand(command: Command, payload: JsonValue = {}): Promise<void> {
    const client = this.client;
    const schemas = COMMAND_SCHEMAS[command];
    if (!client || this._status() !== 'connected') {
      throw new Error('Brak połączenia z urządzeniem.');
    }
    if (!schemas) {
      throw new Error(`Nieznana komenda ${command}.`);
    }

    const request = fromJson(schemas.request, payload);
    await client.request(command, schemas.request, request, schemas.response, { retries: 0 });
  }

  /** Komenda w aktywnej sesji (konfiguracja, stan). Bez połączenia — błąd. */
  async request<Req extends DescMessage, Res extends DescMessage>(
    command: Command,
    requestSchema: Req,
    request: MessageInitShape<Req>,
    responseSchema: Res,
    options?: ProtocolClientOptions,
  ): Promise<MessageShape<Res>> {
    const client = this.client;
    if (!client || this._status() !== 'connected') {
      throw new Error('Brak połączenia z urządzeniem.');
    }
    return client.request(command, requestSchema, request, responseSchema, options);
  }

  private async open(): Promise<void> {
    const generation = ++this.generation;
    const device = this._device();
    if (!device) {
      throw new ConnectionCancelledError('No device');
    }

    this.parser.reset();
    const client = new ProtocolClient((bytes) => this.link.write(bytes), {
      onSend: (frame): void => this.frameLog.add('tx', frame),
    });
    this.client = client;

    await this.link.connect(
      device.deviceId,
      (bytes) => {
        if (generation === this.generation) {
          this.parser.push(bytes);
        }
      },
      () => this.onLinkLost(generation),
    );
    this.ensureCurrent(generation);

    const sessionTimeoutMs = await this.startSession(client);
    this.ensureCurrent(generation);

    const info = await client.request(
      Command.GET_DEVICE_INFO,
      GetDeviceInfoRequestSchema,
      {},
      GetDeviceInfoResponseSchema,
    );
    const name = await this.link.readDeviceName();
    this.ensureCurrent(generation);

    this._deviceInfo.set({
      firmwareVersion: `${info.firmwareVersionMajor}.${info.firmwareVersionMinor}.${info.firmwareVersionPatch}`,
      uid: Array.from(info.deviceUid, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    });
    if (name) {
      this._device.set({ ...device, name });
    }
    this._error.set(null);
    this._status.set('connected');
    this.pingFailures = 0;
    this.schedulePing(generation, pingInterval(sessionTimeoutMs));
  }

  /** START_SESSION; zwraca timeout sesji urządzenia. */
  private async startSession(client: ProtocolClient): Promise<number> {
    const reply = await client.request(
      Command.START_SESSION,
      StartSessionRequestSchema,
      {
        appId: APP_ID,
        protocolVersionMajor: PROTOCOL_VERSION_MAJOR,
        protocolVersionMinor: PROTOCOL_VERSION_MINOR,
      },
      StartSessionResponseSchema,
    );

    switch (reply.status) {
      case Status.OK:
        return reply.sessionTimeoutMs || DEFAULT_SESSION_TIMEOUT_MS;
      case Status.UNSUPPORTED_VERSION:
        throw new SessionRejectedError(
          `Niezgodna wersja protokołu: urządzenie ${reply.protocolVersionMajor}.${reply.protocolVersionMinor}, ` +
            `aplikacja ${PROTOCOL_VERSION_MAJOR}.${PROTOCOL_VERSION_MINOR}. Zaktualizuj ${
              reply.protocolVersionMajor > PROTOCOL_VERSION_MAJOR ? 'aplikację' : 'firmware'
            }.`,
        );
      case Status.UNKNOWN_APP:
        throw new SessionRejectedError('Urządzenie nie obsługuje tej aplikacji.');
      default:
        throw new SessionRejectedError('Urządzenie odrzuciło połączenie.');
    }
  }

  private schedulePing(generation: number, intervalMs: number): void {
    this.pingTimer = setTimeout(() => void this.ping(generation, intervalMs), intervalMs);
  }

  private async ping(generation: number, intervalMs: number): Promise<void> {
    const client = this.client;
    if (generation !== this.generation || !client) {
      return;
    }

    try {
      await client.request(Command.PING, PingRequestSchema, {}, PingResponseSchema);
      this.pingFailures = 0;
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      if (error instanceof ProtocolError && error.status === Status.NO_SESSION) {
        // Sesja wygasła albo STM32 się zresetował — otwórz ją ponownie
        try {
          intervalMs = pingInterval(await this.startSession(client));
          this.pingFailures = 0;
        } catch (sessionError) {
          if (sessionError instanceof SessionRejectedError) {
            this.fail(sessionError);
            await this.link.disconnect().catch(() => undefined);
            return;
          }
          this.pingFailures++;
        }
      } else {
        this.pingFailures++;
      }

      if (this.pingFailures >= MAX_PING_FAILURES) {
        // Łącze BLE jest, ale urządzenie nie odpowiada — połącz od nowa
        await this.link.disconnect().catch(() => undefined);
        this.onLinkLost(generation);
        return;
      }
    }

    if (generation === this.generation) {
      this.schedulePing(generation, intervalMs);
    }
  }

  private onLinkLost(generation: number): void {
    if (generation !== this.generation) {
      return;
    }
    this.generation++;
    const wasConnected = this._status() === 'connected';

    this.clearTimers();
    this.client?.cancelAll(new ConnectionCancelledError('Link lost'));
    this.client = null;

    // Utrata łącza w trakcie łączenia kończy tę próbę błędem — ponawia ją jej wywołujący
    if (wasConnected && this.wanted) {
      this._status.set('reconnecting');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
  }

  private async reconnect(): Promise<void> {
    this.reconnectTimer = null;
    if (!this.wanted) {
      return;
    }

    try {
      await this.link.disconnect().catch(() => undefined);
      await this.open();
    } catch (error) {
      if (!this.wanted) {
        return;
      }
      if (error instanceof SessionRejectedError) {
        this.fail(error);
        await this.link.disconnect().catch(() => undefined);
        return;
      }
      this.scheduleReconnect();
    }
  }

  private ensureCurrent(generation: number): void {
    if (generation !== this.generation || !this.wanted) {
      throw new ConnectionCancelledError('Connection attempt cancelled');
    }
  }

  private fail(error: unknown): void {
    this.wanted = false;
    this.generation++;
    this.clearTimers();
    this.client?.cancelAll(new ConnectionCancelledError('Connection failed'));
    this.client = null;
    this._error.set(describeError(error));
    this._status.set('disconnected');
    this._device.set(null);
    this._deviceInfo.set(null);
  }

  private clearTimers(): void {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** PING co ~1/3 timeoutu sesji (README firmware). */
function pingInterval(sessionTimeoutMs: number): number {
  return Math.max(MIN_PING_INTERVAL_MS, Math.floor(sessionTimeoutMs / 3));
}

function describeError(error: unknown): string {
  if (error instanceof SessionRejectedError) {
    return error.message;
  }
  if (error instanceof ProtocolTimeoutError) {
    return 'Urządzenie nie odpowiada.';
  }
  if (error instanceof ProtocolError) {
    return `Urządzenie zwróciło błąd (${Status[error.status] ?? error.status}).`;
  }
  if (error instanceof ConnectionCancelledError) {
    return 'Połączenie zostało przerwane.';
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/pair|bond/i.test(message)) {
    return 'Parowanie nie powiodło się. Spróbuj ponownie i wpisz kod parowania urządzenia.';
  }
  if (/enable|disabled/i.test(message)) {
    return 'Włącz Bluetooth, aby połączyć się z urządzeniem.';
  }
  if (/timeout/i.test(message)) {
    return 'Nie udało się połączyć z urządzeniem — jest poza zasięgiem albo wyłączone.';
  }
  return `Nie udało się połączyć: ${message}`;
}
