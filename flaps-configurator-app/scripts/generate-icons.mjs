// Ikony aplikacji z icons/logo.png (npm run icons:gen):
//   icons/generated/icon-only.png, icon-foreground.png, icon-background.png — źródła dla
//     @capacitor/assets (iOS, Android), które generuje z nich ikony natywne,
//   icons/generated/desktop-mac.png, desktop-win.png — Electron (electron-builder.yml),
//   src/assets/icon/favicon.png — przeglądarka.
//
// logo.png to zaokrąglony kwadrat na czarnym tle. Wycinamy go, a tło poza zaokrąglonymi
// rogami robimy przezroczyste — tam, gdzie system nie nakłada własnej maski (macOS, Windows,
// warstwa Androida).

import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const SOURCE = 'icons/logo.png';
const OUT = 'icons/generated';
const SIZE = 1024;

/** Zaokrąglony kwadrat w logo.png (zmierzony: metalowa ramka i promień rogu). */
const TILE = { left: 59, top: 55, width: 1127, height: 1159, radius: 340 };

await mkdir(OUT, { recursive: true });

const tile = await sharp(SOURCE).extract(TILE).toBuffer();
const mask = Buffer.from(
  `<svg width="${TILE.width}" height="${TILE.height}">` +
    `<rect width="${TILE.width}" height="${TILE.height}" rx="${TILE.radius}" ry="${TILE.radius}"/></svg>`,
);
/** Kafelek z przezroczystymi rogami. */
const rounded = await sharp(tile)
  .ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const black = { r: 0, g: 0, b: 0, alpha: 1 };

/** Kafelek wpisany w kwadrat `size` z marginesem `scale` (1 = do krawędzi). */
async function placed(size, scale, background) {
  const inner = Math.round(size * scale);
  const image = await sharp(rounded)
    .resize(inner, inner, { fit: 'contain', background: transparent })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: image, gravity: 'center' }])
    .png();
}

// iOS: bez przezroczystości, system sam zaokrągla — kafelek prawie do krawędzi na czarnym
await (
  await placed(SIZE, 0.98, black)
)
  .flatten({ background: '#000000' })
  .toFile(`${OUT}/icon-only.png`);

// Android (ikona adaptacyjna): @capacitor/assets wpisuje warstwy w widoczne 72 z 108 dp
// (inset 16,7 %), a maska koła ma 66 dp — kafelek 90 % mieści się w każdej masce
await (await placed(SIZE, 0.9, transparent)).toFile(`${OUT}/icon-foreground.png`);
await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: '#000000' } })
  .png()
  .toFile(`${OUT}/icon-background.png`);

// macOS: siatka ikon Apple — kafelek 824 px w 1024 px, reszta przezroczysta
await (await placed(SIZE, 824 / 1024, transparent)).toFile(`${OUT}/desktop-mac.png`);
// Windows: bez marginesu (z tego electron-builder robi .ico)
await (await placed(256 * 4, 1, transparent)).toFile(`${OUT}/desktop-win.png`);

await (await placed(64, 1, transparent)).toFile('src/assets/icon/favicon.png');

console.log('Ikony wygenerowane z', SOURCE);
