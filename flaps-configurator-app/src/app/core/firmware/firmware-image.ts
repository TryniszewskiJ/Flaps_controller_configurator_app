/**
 * Plik aktualizacji: .bin aplikacji z buildu firmware, z nagłówkiem AppImageHeader pod 0x400
 * (README firmware „Obraz aplikacji”, Libs/firmware_update/include/firmware_update/image_header.h).
 * Aplikacja sprawdza go przed wysłaniem tak jak `tools/firmware_image.py --check` — sterownik
 * i tak sprawdza go jeszcze raz przy FIRMWARE_UPDATE_COMMIT.
 */

export const IMAGE_HEADER_OFFSET = 0x400;
export const IMAGE_HEADER_SIZE = 64;
export const APP_IMAGE_MAGIC = 0x48504146; // "FAPH"
export const APP_IMAGE_HEADER_VERSION = 1;
export const APP_IMAGE_BOARD_ID = 0x31434645; // "EFC1"
export const APP_LOAD_ADDRESS = 0x08020000;
/** Staging: 7 sektorów po 128 KB bez 64 B na deskryptor i znacznik. */
export const MAX_IMAGE_SIZE = 7 * 128 * 1024 - 64;
/** imageCrc nie wchodzi do własnego CRC. */
const CRC_OFFSET = IMAGE_HEADER_OFFSET + 20;

export interface FirmwareImage {
  fileName: string;
  data: Uint8Array;
  /** Wersja z nagłówka, np. "1.3.0". */
  version: string;
  versionParts: [number, number, number];
  crc: number;
}

/** Plik nie jest poprawnym obrazem — komunikat dla użytkownika. */
export class FirmwareImageError extends Error {}

export function parseFirmwareImage(fileName: string, data: Uint8Array): FirmwareImage {
  if (data.length < IMAGE_HEADER_OFFSET + IMAGE_HEADER_SIZE) {
    throw new FirmwareImageError(
      'Plik jest za mały na obraz firmware — wybierz exhaust_flaps_controller.bin z buildu.',
    );
  }
  if (data.length > MAX_IMAGE_SIZE) {
    throw new FirmwareImageError(
      `Plik ma ${formatSize(data.length)}, a sterownik przyjmuje najwyżej ${formatSize(MAX_IMAGE_SIZE)}.`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const field = (index: number): number => view.getUint32(IMAGE_HEADER_OFFSET + index * 4, true);
  const [magic, headerVersion, boardId, loadAddress, imageSize, imageCrc] = [0, 1, 2, 3, 4, 5].map(
    field,
  );
  const versionParts: [number, number, number] = [field(6), field(7), field(8)];

  if (magic !== APP_IMAGE_MAGIC) {
    throw new FirmwareImageError(
      'To nie jest obraz firmware sterownika (brak nagłówka). Plik sprzed bootloadera albo z innego projektu?',
    );
  }
  if (headerVersion !== APP_IMAGE_HEADER_VERSION) {
    throw new FirmwareImageError(
      `Nieznana wersja nagłówka obrazu (${headerVersion}) — zaktualizuj aplikację.`,
    );
  }
  if (boardId !== APP_IMAGE_BOARD_ID) {
    throw new FirmwareImageError('Obraz jest na inną płytkę.');
  }
  if (loadAddress !== APP_LOAD_ADDRESS) {
    throw new FirmwareImageError(
      `Obraz jest zbudowany pod adres 0x${loadAddress.toString(16).toUpperCase()} — sterownik wymaga 0x08020000.`,
    );
  }
  if (imageSize !== data.length) {
    throw new FirmwareImageError(
      imageSize === 0
        ? 'Obraz bez rozmiaru i CRC w nagłówku — to plik przed tools/firmware_image.py.'
        : `Rozmiar w nagłówku (${imageSize} B) nie zgadza się z plikiem (${data.length} B) — plik jest ucięty albo zmieniony.`,
    );
  }
  if (imageCrcOf(data) !== imageCrc) {
    throw new FirmwareImageError('Plik jest uszkodzony (CRC się nie zgadza).');
  }

  return {
    fileName,
    data,
    version: versionParts.join('.'),
    versionParts,
    crc: imageCrc,
  };
}

/** Porównanie wersji: < 0 starsza, 0 ta sama, > 0 nowsza. */
export function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** "1.2.3" → [1, 2, 3]. */
export function parseVersion(version: string): number[] {
  return version.split('.').map((part) => Number(part) || 0);
}

export function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
}

/** CRC-32 obrazu bez 4 bajtów imageCrc (computeImageCrc w firmware). */
export function imageCrcOf(data: Uint8Array): number {
  const crc = crc32(data.subarray(0, CRC_OFFSET));
  return crc32(data.subarray(CRC_OFFSET + 4), crc);
}

let table: Uint32Array | null = null;

/** CRC-32 (IEEE), jak zlib.crc32; `previous` kontynuuje liczenie. */
export function crc32(data: Uint8Array, previous = 0): number {
  table ??= makeTable();
  let crc = ~previous >>> 0;
  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return ~crc >>> 0;
}

function makeTable(): Uint32Array {
  const result = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    result[n] = c >>> 0;
  }
  return result;
}
