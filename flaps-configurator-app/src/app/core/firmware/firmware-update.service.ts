import { Injectable, computed, inject, signal } from '@angular/core';
import { ConnectionCancelledError, ConnectionService } from '../connection.service';
import {
  BootloaderReason,
  Command,
  FirmwareUpdateAbortRequestSchema,
  FirmwareUpdateAbortResponseSchema,
  FirmwareUpdateBeginRequestSchema,
  FirmwareUpdateBeginResponseSchema,
  FirmwareUpdateCommitRequestSchema,
  FirmwareUpdateCommitResponseSchema,
  FirmwareUpdateDataRequestSchema,
  FirmwareUpdateDataResponseSchema,
  FirmwareUpdateError,
  RebootRequestSchema,
  RebootResponseSchema,
  Status,
} from '../protocol/gen/flaps_pb';
import { ProtocolError, ProtocolTimeoutError } from '../protocol/protocol-client';
import { FirmwareImage } from './firmware-image';

export type UpdatePhase =
  | 'idle'
  | 'erasing' // BEGIN: sterownik kasuje staging
  | 'sending' // DATA
  | 'verifying' // COMMIT: sprawdzenie całego obrazu
  | 'restarting' // restart, bootloader instaluje obraz
  | 'done'
  | 'failed'
  | 'aborted';

/** BEGIN odpowiada po skasowaniu stagingu: do ~15 s przy największym obrazie. */
export const BEGIN_TIMEOUT_MS = 30_000;
/** Ramka 1 KB to kilkadziesiąt zapisów BLE przy małym MTU — sama wysyłka trwa. */
export const DATA_TIMEOUT_MS = 5_000;
const DATA_RETRIES = 3;
export const COMMIT_TIMEOUT_MS = 5_000;
/** Bootloader kopiuje obraz (kilka s), potem aplikacja startuje. */
export const RESTART_TIMEOUT_MS = 45_000;
/** Paczka DATA: wielokrotność słowa flasha (32 B), max 1024. */
const MAX_CHUNK_SIZE = 1024;
const FLASH_WORD = 32;

/** Przerwane przez użytkownika. */
class UpdateCancelledError extends Error {}
/** Odmowa sterownika albo zły obraz — komunikat dla użytkownika. */
class FirmwareUpdateFailure extends Error {}

/**
 * Aktualizacja firmware przez BLE (README firmware „Przebieg aktualizacji”):
 * BEGIN → DATA po jednej paczce → COMMIT → restart i ponowna sesja, porównanie wersji.
 * Działa też z bootloaderem (tryb ratunkowy).
 */
@Injectable({ providedIn: 'root' })
export class FirmwareUpdateService {
  private readonly connection = inject(ConnectionService);

  private readonly _phase = signal<UpdatePhase>('idle');
  private readonly _sent = signal(0);
  private readonly _total = signal(0);
  private readonly _error = signal<string | null>(null);
  /** Wersja przed i po aktualizacji. */
  private readonly _versions = signal<{ before: string; after: string | null } | null>(null);
  private readonly _rebooting = signal(false);

  readonly phase = this._phase.asReadonly();
  readonly sent = this._sent.asReadonly();
  readonly total = this._total.asReadonly();
  readonly error = this._error.asReadonly();
  readonly versions = this._versions.asReadonly();
  readonly rebooting = this._rebooting.asReadonly();
  readonly running = computed(() =>
    ['erasing', 'sending', 'verifying', 'restarting'].includes(this._phase()),
  );
  /** Przerwać można do COMMIT — potem obraz jest już przyjęty. */
  readonly canAbort = computed(() => ['erasing', 'sending'].includes(this._phase()));
  /** 0..1 */
  readonly progress = computed(() => (this._total() ? this._sent() / this._total() : 0));

  private cancelled = false;

  /** Wysyła obraz; wynik w phase / error / versions. */
  async start(image: FirmwareImage): Promise<void> {
    if (this.running() || this._rebooting()) {
      return;
    }
    const before = this.connection.deviceInfo()?.firmwareVersion ?? '—';
    this.cancelled = false;
    this._error.set(null);
    this._versions.set({ before, after: null });
    this._sent.set(0);
    this._total.set(image.data.length);
    this._phase.set('erasing');

    const releasePing = this.connection.holdPing();
    let committed = false;
    try {
      const chunkSize = await this.begin(image.data.length);
      this._phase.set('sending');
      await this.send(image.data, chunkSize);

      this.throwIfCancelled();
      this._phase.set('verifying');
      await this.commit();
      committed = true;

      releasePing();
      this._phase.set('restarting');
      const info = await this.connection.awaitRestart(RESTART_TIMEOUT_MS);
      this._versions.set({ before, after: info.firmwareVersion });
      if (info.mode === 'bootloader') {
        throw new FirmwareUpdateFailure(
          `Sterownik został w trybie ratunkowym (${describeBootloaderReason(info.bootloaderReason)}).`,
        );
      }
      this._phase.set('done');
    } catch (error) {
      if (error instanceof UpdateCancelledError) {
        this._phase.set('aborted');
      } else {
        this._phase.set('failed');
        this._error.set(describeError(error, committed ? 'restart' : 'transfer'));
      }
      if (!committed) {
        await this.sendAbort();
      }
    } finally {
      releasePing();
    }
  }

  /** Przerywa po bieżącej paczce; działający firmware zostaje. */
  abort(): void {
    if (this.canAbort()) {
      this.cancelled = true;
    }
  }

  /** Czyści wynik poprzedniej aktualizacji. */
  reset(): void {
    if (!this.running()) {
      this._phase.set('idle');
      this._error.set(null);
      this._versions.set(null);
      this._sent.set(0);
      this._total.set(0);
    }
  }

  /** REBOOT: restart (toBootloader = zostań w trybie ratunkowym) i ponowna sesja. */
  async reboot(toBootloader: boolean): Promise<void> {
    if (this.running() || this._rebooting()) {
      return;
    }
    this._rebooting.set(true);
    this._error.set(null);
    try {
      const reply = await this.connection.request(
        Command.REBOOT,
        RebootRequestSchema,
        { toBootloader },
        RebootResponseSchema,
        { retries: 0 },
      );
      if (reply.status === Status.NO_VALID_FIRMWARE) {
        throw new FirmwareUpdateFailure(
          'Na sterowniku nie ma poprawnego firmware do uruchomienia — wgraj obraz.',
        );
      }
      if (reply.status !== Status.OK) {
        throw new FirmwareUpdateFailure('Sterownik odrzucił restart.');
      }
      await this.connection.awaitRestart(RESTART_TIMEOUT_MS);
    } catch (error) {
      this._error.set(describeError(error, 'restart'));
    } finally {
      this._rebooting.set(false);
    }
  }

  /** BEGIN; zwraca rozmiar paczki. */
  private async begin(imageSize: number): Promise<number> {
    const reply = await this.connection.request(
      Command.FIRMWARE_UPDATE_BEGIN,
      FirmwareUpdateBeginRequestSchema,
      { imageSize },
      FirmwareUpdateBeginResponseSchema,
      // Ponowiony BEGIN z tym samym rozmiarem przed DATA nie kasuje drugi raz
      { timeoutMs: BEGIN_TIMEOUT_MS, retries: 1 },
    );
    checkStatus(reply.status, reply.error);
    if (reply.maxImageSize && imageSize > reply.maxImageSize) {
      throw new FirmwareUpdateFailure(
        `Obraz jest za duży dla tego sterownika (max ${reply.maxImageSize} B).`,
      );
    }
    const max = Math.min(reply.maxChunkSize || MAX_CHUNK_SIZE, MAX_CHUNK_SIZE);
    return Math.max(FLASH_WORD, max - (max % FLASH_WORD));
  }

  /** DATA po jednej paczce, zawsze czekając na odpowiedź. */
  private async send(data: Uint8Array, chunkSize: number): Promise<void> {
    let offset = 0;
    while (offset < data.length) {
      this.throwIfCancelled();
      const reply = await this.connection.request(
        Command.FIRMWARE_UPDATE_DATA,
        FirmwareUpdateDataRequestSchema,
        { offset, data: data.subarray(offset, offset + chunkSize) },
        FirmwareUpdateDataResponseSchema,
        // Ponowienie tej samej paczki jest bezpieczne (zgodna z zapisaną = OK)
        { timeoutMs: DATA_TIMEOUT_MS, retries: DATA_RETRIES },
      );
      // INVALID_OFFSET: odpowiedź mówi, od którego miejsca kontynuować
      if (!(
        reply.status === Status.FIRMWARE_UPDATE_ERROR &&
        isResumable(reply.error, reply.received, offset)
      )) {
        checkStatus(reply.status, reply.error);
      }
      offset = reply.received;
      this._sent.set(Math.min(offset, data.length));
    }
  }

  private async commit(): Promise<void> {
    const reply = await this.connection.request(
      Command.FIRMWARE_UPDATE_COMMIT,
      FirmwareUpdateCommitRequestSchema,
      {},
      FirmwareUpdateCommitResponseSchema,
      // Ponowiony COMMIT po sukcesie też dostaje OK
      { timeoutMs: COMMIT_TIMEOUT_MS, retries: 1 },
    );
    checkStatus(reply.status, reply.error);
  }

  /** ABORT (bez sesji też w porządku — wtedy aktualizacja i tak jest przerwana). */
  private async sendAbort(): Promise<void> {
    if (!this.connection.connected()) {
      return;
    }
    await this.connection
      .request(
        Command.FIRMWARE_UPDATE_ABORT,
        FirmwareUpdateAbortRequestSchema,
        {},
        FirmwareUpdateAbortResponseSchema,
      )
      .catch(() => undefined);
    // Raporty i tryb dev wracają po GET_STATE / SET_DEV_MODE, jak w nowej sesji
    this.connection.resync();
  }

  private throwIfCancelled(): void {
    if (this.cancelled) {
      throw new UpdateCancelledError();
    }
  }
}

function isResumable(error: FirmwareUpdateError, received: number, offset: number): boolean {
  return error === FirmwareUpdateError.INVALID_OFFSET && received !== offset;
}

function checkStatus(status: Status, error: FirmwareUpdateError): void {
  if (status === Status.OK) {
    return;
  }
  throw new FirmwareUpdateFailure(
    `${
      status === Status.FIRMWARE_UPDATE_ERROR
        ? describeUpdateError(error)
        : `Sterownik odrzucił aktualizację (${Status[status] ?? status}).`
    } Sterownik działa na dotychczasowym firmware.`,
  );
}

export function describeUpdateError(error: FirmwareUpdateError): string {
  return UPDATE_ERRORS[error] ?? `Błąd aktualizacji (kod ${error}).`;
}

const UPDATE_ERRORS: Partial<Record<FirmwareUpdateError, string>> = {
  [FirmwareUpdateError.INVALID_SIZE]: 'Sterownik nie przyjmie obrazu tego rozmiaru.',
  [FirmwareUpdateError.NOT_STARTED]:
    'Sterownik przerwał aktualizację (np. wygasła sesja) — spróbuj ponownie.',
  [FirmwareUpdateError.ERASING]: 'Sterownik jeszcze kasuje pamięć — spróbuj za chwilę.',
  [FirmwareUpdateError.INVALID_OFFSET]: 'Paczki dotarły w złej kolejności — spróbuj ponownie.',
  [FirmwareUpdateError.INVALID_LENGTH]: 'Niepoprawna długość paczki.',
  [FirmwareUpdateError.DATA_MISMATCH]:
    'Ponowiona paczka różni się od zapisanej — spróbuj ponownie.',
  [FirmwareUpdateError.INCOMPLETE]: 'Sterownik nie dostał całego obrazu — spróbuj ponownie.',
  [FirmwareUpdateError.INVALID_IMAGE]: 'Sterownik odrzucił obraz: brak nagłówka albo zły adres.',
  [FirmwareUpdateError.WRONG_BOARD]: 'Sterownik odrzucił obraz: jest na inną płytkę.',
  [FirmwareUpdateError.CRC_MISMATCH]:
    'Obraz uszkodził się po drodze (CRC się nie zgadza) — spróbuj ponownie.',
  [FirmwareUpdateError.FLASH]: 'Błąd zapisu pamięci flash sterownika.',
};

export function describeBootloaderReason(reason: BootloaderReason): string {
  switch (reason) {
    case BootloaderReason.NO_VALID_FIRMWARE:
      return 'brak poprawnego firmware';
    case BootloaderReason.CRASH_LOOP:
      return 'firmware 3 razy z rzędu zresetował watchdog';
    case BootloaderReason.REQUESTED:
      return 'na żądanie';
    default:
      return 'nieznany powód';
  }
}

/** transfer — przed COMMIT (działa stary firmware), restart — po COMMIT albo REBOOT. */
function describeError(error: unknown, stage: 'transfer' | 'restart'): string {
  if (error instanceof FirmwareUpdateFailure) {
    return error.message;
  }
  if (error instanceof ProtocolTimeoutError) {
    return stage === 'restart'
      ? 'Sterownik nie odpowiada po restarcie.'
      : 'Sterownik przestał odpowiadać — aktualizacja przerwana, działa dotychczasowy firmware.';
  }
  if (error instanceof ProtocolError) {
    return error.status === Status.UNKNOWN_COMMAND
      ? 'Firmware sterownika nie obsługuje aktualizacji przez BLE — wgraj bootloader ST-Linkiem.'
      : `Urządzenie zwróciło błąd (${Status[error.status] ?? error.status}).`;
  }
  if (error instanceof ConnectionCancelledError && stage === 'restart') {
    return 'Połączenie przerwane w trakcie restartu — połącz się ponownie i sprawdź wersję firmware.';
  }
  const message = error instanceof Error ? error.message : String(error);
  return stage === 'restart'
    ? message
    : 'Połączenie przerwane — aktualizacja nie doszła do skutku, działa dotychczasowy firmware.';
}
