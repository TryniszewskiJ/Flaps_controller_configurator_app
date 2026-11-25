/**
 * Cały protokół (wszystkie pliki flaps*.proto) — tylko dla kodu aplikacji technika.
 * Kod wspólny z aplikacją użytkownika importuje wyłącznie potrzebne pliki z ./gen
 * (flaps_common_pb, flaps_state_pb, flaps_logic_pb, flaps_firmware_pb, flaps_user_pb) —
 * pilnuje tego ESLint (no-restricted-imports) i scripts/check-user-bundle.mjs.
 */
export * from './gen/flaps_common_pb';
export * from './gen/flaps_state_pb';
export * from './gen/flaps_logic_pb';
export * from './gen/flaps_firmware_pb';
export * from './gen/flaps_user_pb';
export * from './gen/flaps_pb';
