import {
  APP_IMAGE_BOARD_ID,
  APP_IMAGE_HEADER_VERSION,
  APP_IMAGE_MAGIC,
  APP_LOAD_ADDRESS,
  IMAGE_HEADER_OFFSET,
  imageCrcOf,
} from '../firmware/firmware-image';

export interface ImageOptions {
  version?: [number, number, number];
  size?: number;
  boardId?: number;
}

/** Poprawny obraz aplikacji jak z tools/firmware_image.py (nagłówek pod 0x400, rozmiar, CRC). */
export function buildFirmwareImage(options: ImageOptions = {}): Uint8Array {
  const { version = [1, 3, 0], size = 3000, boardId = APP_IMAGE_BOARD_ID } = options;
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = (i * 7) & 0xff;
  }
  const view = new DataView(data.buffer);
  const set = (index: number, value: number): void =>
    view.setUint32(IMAGE_HEADER_OFFSET + index * 4, value, true);
  const fields = [
    APP_IMAGE_MAGIC,
    APP_IMAGE_HEADER_VERSION,
    boardId,
    APP_LOAD_ADDRESS,
    size,
    0,
    ...version,
  ];
  fields.forEach((value, index) => set(index, value));
  for (let i = fields.length; i < 16; i++) {
    set(i, 0);
  }
  set(5, imageCrcOf(data));
  return data;
}
