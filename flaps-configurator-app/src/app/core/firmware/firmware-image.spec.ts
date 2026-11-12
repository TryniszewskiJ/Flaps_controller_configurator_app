import { buildFirmwareImage } from '../testing/firmware-image-builder';
import { IMAGE_HEADER_OFFSET, compareVersions, crc32, parseFirmwareImage } from './firmware-image';

describe('firmware image', () => {
  it('computes CRC-32 like zlib', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('reads the version from a valid image', () => {
    const image = parseFirmwareImage('app.bin', buildFirmwareImage({ version: [2, 0, 1] }));

    expect(image.version).toBe('2.0.1');
    expect(image.data.length).toBe(3000);
  });

  it('rejects a file without the header', () => {
    const data = buildFirmwareImage();
    data[IMAGE_HEADER_OFFSET] ^= 0xff;

    expect(() => parseFirmwareImage('x.bin', data)).toThrow(/brak nagłówka/);
  });

  it('rejects an image for another board', () => {
    expect(() => parseFirmwareImage('x.bin', buildFirmwareImage({ boardId: 0x12345678 }))).toThrow(
      /inną płytkę/,
    );
  });

  it('rejects a damaged or truncated image', () => {
    const damaged = buildFirmwareImage();
    damaged[2000] ^= 0x01;
    expect(() => parseFirmwareImage('x.bin', damaged)).toThrow(/CRC/);

    const truncated = buildFirmwareImage().subarray(0, 2500);
    expect(() => parseFirmwareImage('x.bin', truncated)).toThrow(/ucięty/);

    expect(() => parseFirmwareImage('x.bin', new Uint8Array(100))).toThrow(/za mały/);
  });

  it('compares versions', () => {
    expect(compareVersions([1, 3, 0], [1, 2, 9])).toBeGreaterThan(0);
    expect(compareVersions([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(compareVersions([0, 9, 0], [1, 0, 0])).toBeLessThan(0);
  });
});
