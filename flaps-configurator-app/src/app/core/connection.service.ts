import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { DescMessage, MessageInitShape, MessageShape } from '@bufbuild/protobuf';
import { BleLinkService, FoundDevice, PairingTimeoutError } from './ble/ble-link.service';
import { Frame, FrameParser } from './protocol/frame';
import {
  BootloaderReason,
  CloseSessionRequestSchema,
  CloseSessionResponseSchema,
  Command,
  DeviceMode,
  GetDeviceInfoRequestSchema,
  GetDeviceInfoResponseSchema,
  PingRequestSchema,
  PingResponseSchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
  Status,
} from './protocol/gen/flaps_common_pb';
import {
  PROTOCOL_VERSION_MAJOR,
  PROTOCOL_VERSION_MINOR,
  ProtocolClient,
  ProtocolClientOptions,
  ProtocolError,
  ProtocolTimeoutError,
} from './protocol/protocol-client';
import { t } from './i18n/i18n';

/**
 * StartSessionRequest.app_id tej aplikacji — sterownik po nim rozpoznaje aplikację technika
 * (wszystkie komendy) i użytkownika (tylko jej komendy). Podaje go main.ts każdej aplikacji.
 */
export const APP_ID = new InjectionToken<number>('StartSessionRequest.app_id');

/** Podgląd wszystkich ramek (log ramek w Dev console aplikacji technika). */
export interface FrameObserver {
  add(direction: 'rx' | 'tx', frame: Frame): void;
}

export const FRAME_OBSERVER = new InjectionToken<FrameObserver | null>('frame observer', {
  providedIn: 'root',
  factory: (): FrameObserver | null => null,
});

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ConnectedDevice {
  deviceId: string;
  name: string;
}

export interface DeviceInfo {
  /** W bootloaderze — wersja zainstalowanej aplikacji, "0.0.0" = brak. */
  firmwareVersion: string;
  /** 96-bitowy UID MCU w hex. */
  uid: string;
  /** Bootloader = tryb ratunkowy: tylko sesja, informacje i aktualizacja firmware. */
  mode: 'application' | 'bootloader';
  /** Dlaczego bootloader został w trybie ratunkowym. */
  bootloaderReason: BootloaderReason;
}

/** Nazwa sterownika, gdy urządzenie jej nie podaje (w bieżącym języku). */
export function defaultDeviceName(): string {
  return t('connection.defaultName');
}
export const RECONNECT_DELAY_MS = 2000;
const DEFAULT_SESSION_TIMEOUT_MS = 8000;
const MIN_PING_INTERVAL_MS = 1000;
const MAX_PING_FAILURES = 3;
/** Po restarcie urządzenia: START_SESSION co tyle, aż odpowie. */
const RESTART_RETRY_MS = 1000;

/** Urządzenie odrzuciło sesję (inna wersja protokołu, obca aplikacja) — ponawianie nic nie da. */
class SessionRejectedError extends Error {}
/** Próba połączenia przerwana (Rozłącz / utrata łącza w trakcie). */
export class ConnectionCancelledError extends Error {}

/**
 * Połączenie ze sterownikiem: BLE (mostek nRF52) + sesja protokołu STM32.
 * Utrzymuje połączenie (ping, ponowne łączenie), dopóki użytkownik nie wybierze "Rozłącz".
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private readonly link = inject(BleLinkService);
  private readonly appId = inject(APP_ID);
  private readonly frameObserver = inject(FRAME_OBSERVER);

  private readonly _status = signal<ConnectionStatus>('disconnected');
  private readonly _device = signal<ConnectedDevice | null>(null);
  private readonly _deviceInfo = signal<DeviceInfo | null>(null);
  private readonly _protocolMinor = signal<number | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly status = this._status.asReadonly();
  readonly device = this._device.asReadonly();
  readonly deviceInfo = this._deviceInfo.asReadonly();
  /** Wersja minor protokołu urządzenia (z START_SESSION) — co urządzenie obsługuje. */
  readonly protocolMinor = this._protocolMinor.asReadonly();
  /** Powód ostatniego nieudanego połączenia. */
  readonly error = this._error.asReadonly();
  readonly connected = computed(() => this._status() === 'connected');
  readonly deviceName = computed(() => this._device()?.name ?? null);
  /** Połączono z bootloaderem (tryb ratunkowy) — klapy nie są sterowane, działa tylko aktualizacja. */
  readonly inBootloader = computed(() => this._deviceInfo()?.mode === 'bootloader');
  /** Połączono z firmware sterownika — można czytać konfigurację i stan. */
  readonly application = computed(() => this.connected() && !this.inBootloader());

  private readonly _session = signal(0);
  /**
   * Rośnie przy każdym otwarciu sesji (także ponownym START_SESSION po NO_SESSION).
   * Urządzenie wysyła stan, logi i AMP_OUT dopiero po GET_STATE w nowej sesji.
   */
  readonly session = this._session.asReadonly();

  private readonly unsolicitedListeners = new Set<(frame: Frame) => void>();

  /** Użytkownik chce być połączony (od "Połącz" do "Rozłącz"). */
  private wanted = false;
  /** Zmienia się przy każdym połączeniu i jego końcu — unieważnia callbacki starych połączeń. */
  private generation = 0;
  private client: ProtocolClient | null = null;
  private readonly parser = new FrameParser((frame) => {
    this.frameObserver?.add('rx', frame);
    if (isUnsolicited(frame.command)) {
      this.unsolicitedListeners.forEach((listener) => listener(frame));
      return;
    }
    this.client?.handleFrame(frame);
  });
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingFailures = 0;
  /** Ile operacji wstrzymało ping (aktualizacja firmware — każde żądanie i tak przedłuża sesję). */
  private pingHolds = 0;

  async connect(device: FoundDevice): Promise<void> {
    if (this._status() !== 'disconnected') {
      await this.disconnect();
    }

    this.wanted = true;
    this._error.set(null);
    this._device.set({ deviceId: device.deviceId, name: device.name || defaultDeviceName() });
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
    this._protocolMinor.set(null);
  }

  /**
   * Wstrzymuje PING, dopóki nie zostanie wywołana zwrócona funkcja. Aktualizacja firmware wysyła
   * po jednej ramce naraz — ping między kawałkami dużej ramki BLE by ją rozbił.
   */
  holdPing(): () => void {
    this.pingHolds++;
    let released = false;
    return (): void => {
      if (!released) {
        released = true;
        this.pingHolds--;
      }
    };
  }

  /** Nowa sesja dla stanu i trybu dev (np. po przerwanej aktualizacji raporty wracają po GET_STATE). */
  resync(): void {
    if (this.connected()) {
      this._session.update((session) => session + 1);
    }
  }

  /**
   * Urządzenie restartuje się (po FIRMWARE_UPDATE_COMMIT albo REBOOT), BLE zostaje połączone.
   * START_SESSION co ~1 s, aż odpowie (bootloader może najpierw instalować obraz), potem
   * GET_DEVICE_INFO. Bez odpowiedzi w `timeoutMs` — łączenie od nowa jak po utracie łącza.
   */
  async awaitRestart(timeoutMs: number): Promise<DeviceInfo> {
    const generation = this.generation;
    const client = this.client;
    if (!client || this._status() !== 'connected') {
      throw new Error(t('common.notConnected'));
    }

    this.clearTimers();
    this._status.set('reconnecting');
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      this.ensureCurrent(generation);
      try {
        const sessionTimeoutMs = await this.startSession(client, {
          timeoutMs: RESTART_RETRY_MS,
          retries: 0,
        });
        this.ensureCurrent(generation);
        const info = await this.loadDeviceInfo(client);
        this.ensureCurrent(generation);
        this._status.set('connected');
        this._session.update((session) => session + 1);
        this.pingFailures = 0;
        this.schedulePing(generation, pingInterval(sessionTimeoutMs));
        return info;
      } catch (error) {
        if (error instanceof SessionRejectedError) {
          this.fail(error);
          await this.link.disconnect().catch(() => undefined);
          throw error;
        }
        if (error instanceof ConnectionCancelledError || generation !== this.generation) {
          throw error;
        }
        if (Date.now() >= deadline) {
          await this.link.disconnect().catch(() => undefined);
          this.onLinkLost(generation);
          throw new Error(t('connection.noRestartResponse'), {
            cause: error,
          });
        }
        if (!(error instanceof ProtocolTimeoutError)) {
          await delay(RESTART_RETRY_MS);
        }
      }
    }
  }

  /** Wiadomości bez żądania (TELEMETRY, EVENT, LOG, AMP_OUT); zwraca wypisanie. */
  onUnsolicited(listener: (frame: Frame) => void): () => void {
    this.unsolicitedListeners.add(listener);
    return () => this.unsolicitedListeners.delete(listener);
  }

  /** Komenda w aktywnej sesji (konfiguracja, stan). Bez połączenia — błąd. */
  async request<Req extends DescMessage, Res extends DescMessage>(
    /** Command albo TechnicianCommand (aplikacja technika). */
    command: number,
    requestSchema: Req,
    request: MessageInitShape<Req>,
    responseSchema: Res,
    options?: ProtocolClientOptions,
  ): Promise<MessageShape<Res>> {
    const client = this.client;
    if (!client || this._status() !== 'connected') {
      throw new Error(t('common.notConnected'));
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
      onSend: (frame): void => this.frameObserver?.add('tx', frame),
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

    await this.loadDeviceInfo(client);
    const name = await this.link.readDeviceName();
    this.ensureCurrent(generation);

    if (name) {
      this._device.set({ ...device, name });
    }
    this._error.set(null);
    this._status.set('connected');
    this._session.update((session) => session + 1);
    this.pingFailures = 0;
    this.schedulePing(generation, pingInterval(sessionTimeoutMs));
  }

  private async loadDeviceInfo(client: ProtocolClient): Promise<DeviceInfo> {
    const reply = await client.request(
      Command.GET_DEVICE_INFO,
      GetDeviceInfoRequestSchema,
      {},
      GetDeviceInfoResponseSchema,
    );
    const info: DeviceInfo = {
      firmwareVersion: `${reply.firmwareVersionMajor}.${reply.firmwareVersionMinor}.${reply.firmwareVersionPatch}`,
      uid: Array.from(reply.deviceUid, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      // Starszy firmware nie wysyła trybu (UNSPECIFIED) — to zawsze aplikacja
      mode: reply.mode === DeviceMode.BOOTLOADER ? 'bootloader' : 'application',
      bootloaderReason: reply.bootloaderReason,
    };
    this._deviceInfo.set(info);
    return info;
  }

  /** START_SESSION; zwraca timeout sesji urządzenia. */
  private async startSession(
    client: ProtocolClient,
    options?: ProtocolClientOptions,
  ): Promise<number> {
    const reply = await client.request(
      Command.START_SESSION,
      StartSessionRequestSchema,
      {
        appId: this.appId,
        protocolVersionMajor: PROTOCOL_VERSION_MAJOR,
        protocolVersionMinor: PROTOCOL_VERSION_MINOR,
      },
      StartSessionResponseSchema,
      options,
    );

    switch (reply.status) {
      case Status.OK:
        this._protocolMinor.set(reply.protocolVersionMinor);
        return reply.sessionTimeoutMs || DEFAULT_SESSION_TIMEOUT_MS;
      case Status.UNSUPPORTED_VERSION:
        throw new SessionRejectedError(
          t('connection.protocolMismatch', {
            device: `${reply.protocolVersionMajor}.${reply.protocolVersionMinor}`,
            app: `${PROTOCOL_VERSION_MAJOR}.${PROTOCOL_VERSION_MINOR}`,
            what: t(
              reply.protocolVersionMajor > PROTOCOL_VERSION_MAJOR
                ? 'connection.updateApp'
                : 'connection.updateFirmware',
            ),
          }),
        );
      case Status.UNKNOWN_APP:
        throw new SessionRejectedError(t('connection.unknownApp'));
      default:
        throw new SessionRejectedError(t('connection.rejected'));
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
    if (this.pingHolds > 0) {
      this.schedulePing(generation, intervalMs);
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
          this._session.update((session) => session + 1);
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
    // Także w trakcie restartu urządzenia (awaitRestart)
    const wasConnected = this._status() === 'connected' || this._status() === 'reconnecting';

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
    this._protocolMinor.set(null);
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 0x70–0x7F: wysyłane przez urządzenie bez żądania (README firmware, zakresy CMD). */
function isUnsolicited(command: number): boolean {
  return command >= 0x70 && command <= 0x7f;
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
    return t('common.noResponse');
  }
  if (error instanceof ProtocolError) {
    return t('common.deviceError', { status: Status[error.status] ?? error.status });
  }
  if (error instanceof ConnectionCancelledError) {
    return t('connection.cancelled');
  }
  if (error instanceof PairingTimeoutError) {
    return t('connection.pairingTimeout');
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/pair|bond/i.test(message)) {
    return t('connection.pairingFailed');
  }
  if (/enable|disabled/i.test(message)) {
    return t('connection.bluetoothOff');
  }
  if (/timeout/i.test(message)) {
    return t('connection.outOfRange');
  }
  return t('connection.failed', { message });
}
