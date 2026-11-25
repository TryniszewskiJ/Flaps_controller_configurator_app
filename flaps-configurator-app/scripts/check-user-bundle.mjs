// Sprawdza, czy zbudowana aplikacja użytkownika (www-user/, npm run user:build) nie zawiera nic
// z protokołu i kodu aplikacji technika:
//   - opisy plików proto (protobuf-es osadza je jako base64) — tylko pliki wspólne i flaps_user.proto,
//   - nazwy z flaps.proto (konfiguracja, CAN sniff, logi, AMP_OUT) i app_id technika.
// Kończy się błędem, gdy coś znajdzie — wtedy któryś wspólny plik importuje kod technika.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2] ?? 'www-user';

const ALLOWED_PROTO_FILES = new Set([
  'flaps_common.proto',
  'flaps_state.proto',
  'flaps_logic.proto',
  'flaps_firmware.proto',
  'flaps_user.proto',
]);

/** Ślady protokołu / kodu technika w tekście bundla. */
const FORBIDDEN_TEXT = [
  'GetConfiguration',
  'SetConfiguration',
  'SaveConfiguration',
  'CanSniff',
  'AmpOut',
  'TechnicianCommand',
  'flaps.Configuration',
  'flaps.CanFrame',
  'flaps.Signal"',
  // app_id technika ("FLAP") w każdym zapisie, jaki może zostawić minifikator
  '0x464c4150',
  '0x464C4150',
  '1179402576',
];

const files = readdirSync(DIR).filter((name) => name.endsWith('.js'));
if (files.length === 0) {
  console.error(`Brak plików .js w ${DIR} — najpierw npm run user:build.`);
  process.exit(1);
}

const problems = [];
const protoFiles = new Set();

for (const name of files) {
  const text = readFileSync(join(DIR, name), 'utf8');

  for (const needle of FORBIDDEN_TEXT) {
    if (text.includes(needle)) {
      problems.push(`${name}: zawiera "${needle}"`);
    }
  }

  // Opis pliku proto: base64 FileDescriptorProto, pole 1 (nazwa pliku) na początku
  for (const [, base64] of text.matchAll(/["'`]([A-Za-z0-9+/]{24,}={0,2})["'`]/g)) {
    const bytes = Buffer.from(base64, 'base64');
    if (bytes[0] !== 0x0a || bytes[1] > 64) {
      continue;
    }
    const fileName = bytes.subarray(2, 2 + bytes[1]).toString('latin1');
    if (!fileName.endsWith('.proto')) {
      continue;
    }
    protoFiles.add(fileName);
    if (!ALLOWED_PROTO_FILES.has(fileName)) {
      problems.push(`${name}: zawiera opis ${fileName}`);
    }
  }
}

if (problems.length > 0) {
  console.error('Aplikacja użytkownika zawiera kod / protokół technika:');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `Bundle aplikacji użytkownika OK (${files.length} plików JS, proto: ${[...protoFiles].sort().join(', ')}).`,
);
