# Flaps Controller Configurator App

Aplikacja mobilna (Android / iOS) do konfiguracji sterownika klap przez Bluetooth Low Energy.

Zbudowana na Ionic + Angular + Capacitor. Komunikacja BLE przez plugin
[`@capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le).

> Status: szkielet projektu (szablon Ionic „blank” z dodanym pluginem BLE).

## Stack

| Element    | Wersja |
|------------|--------|
| Angular    | 22     |
| Ionic      | 9      |
| Capacitor  | 8      |
| Node.js    | 24     |
| JDK        | 21 (wymagany do builda Androida) |
| Android    | minSdk 24, targetSdk 36 |

## Struktura repozytorium

```
flaps-configurator-app/      # projekt Ionic/Angular
├── src/                     # kod aplikacji (Angular)
├── android/                 # natywny projekt Android (Capacitor)
├── capacitor.config.ts      # konfiguracja Capacitora
└── package.json
```

## Wymagania

- Node.js 24 i npm
- Ionic CLI: `npm install -g @ionic/cli`
- Android Studio z Android SDK (platforma 36) i emulatorem
- **JDK 21** — Gradle 8.14 nie działa na Javie 25/26
  (błąd `Unsupported class file major version 69/70`)

### Konfiguracja środowiska (Windows)

1. Zainstaluj JDK 21, np. `winget install Microsoft.OpenJDK.21`.
2. Ustaw zmienne użytkownika:
   - `JAVA_HOME` = katalog JDK 21
   - `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`
   - do `PATH` dodaj `%ANDROID_HOME%\platform-tools` i `%ANDROID_HOME%\emulator`
3. Jeśli w systemie jest też nowsza Java, wskaż Gradle'owi JDK 21 na stałe
   w `%USERPROFILE%\.gradle\gradle.properties`:
   ```properties
   org.gradle.java.home=C:/Program Files/Microsoft/jdk-21.0.12.101-hotspot
   ```
4. W `flaps-configurator-app/android/local.properties` (nie jest w repo) ustaw ścieżkę do SDK:
   ```properties
   sdk.dir=C:/Users/<user>/AppData/Local/Android/Sdk
   ```
   Android Studio tworzy ten plik automatycznie przy otwarciu projektu.
5. Zrestartuj terminal / VS Code.

## Uruchomienie

```bash
cd flaps-configurator-app
npm install
```

### W przeglądarce

```bash
ionic serve
```

Bluetooth nie działa w przeglądarce w pełnym zakresie — do testów BLE używaj urządzenia lub emulatora.

### Na Androidzie (emulator lub telefon)

```bash
ionic build
npx cap sync android
npx cap run android --target Xiaomi_14T
```

`--target` to nazwa AVD (lista: `npx cap run android --list`). Bez `--target` CLI zapyta o urządzenie.
Jeśli emulator jest wyłączony, zostanie uruchomiony automatycznie — przy pierwszym starcie
może być potrzebne ponowne wywołanie komendy.

Otwarcie projektu w Android Studio:

```bash
npx cap open android
```

## Połączenie z urządzeniem

Sterownik to STM32 ([`exhaust_flaps_controller`](https://github.com/TryniszewskiJ/exhaust_flaps_controller))
z modułem nRF52832, który jest przezroczystym mostkiem BLE ↔ UART (`NRF52_UART_BLE_BRIDGE`).
Protokół (ramki, sesja, komendy) opisuje README firmware STM32, a GATT — kod mostka nRF52.

```
UI (baner, wybór urządzenia)
  └─ ConnectionService        core/connection.service.ts — sesja, ping, ponowne łączenie
       ├─ ProtocolClient      core/protocol/protocol-client.ts — SEQ, timeout 500 ms, ponowienia, ERROR
       │    └─ ramki          core/protocol/frame.ts — 0xA5 … CRC-16/CCITT-FALSE, parser kawałków
       └─ BleLinkService      core/ble/ble-link.service.ts — skan, połączenie, notyfikacje, zapis
```

| GATT mostka nRF52 | UUID |
|---|---|
| Serwis (rozgłaszany — po nim filtrowane są „swoje” urządzenia) | `6a756861-9ef3-40e8-b49b-2c98a6bb47fb` |
| RX — zapis aplikacja → STM32 | `63a1f737-d934-4d24-be30-92b242379fb3` |
| TX — notyfikacje STM32 → aplikacja | `52fa30a9-0084-40f5-9782-ef6f0c91206d` |

> README firmware STM32 wymienia Nordic UART Service — mostek używa jednak własnego serwisu
> z tabeli wyżej (źródło: `ble_uart_bridge/src/ble.h`).

Przebieg:

1. **Połącz** otwiera listę sterowników w pobliżu (skan po UUID serwisu; w przeglądarce — okno
   wyboru Web Bluetooth).
2. Po wyborze: połączenie BLE, przy pierwszym połączeniu **parowanie z kluczem** (systemowe okno
   Androida), `START_SESSION`, `GET_DEVICE_INFO`.
3. `PING` co ⅓ `session_timeout_ms`. `ERROR(NO_SESSION)` (np. reset STM32) — sesja otwierana
   ponownie; 3 pingi bez odpowiedzi — ponowne połączenie.
4. Utrata połączenia bez kliknięcia **Rozłącz** — ponowne łączenie co 2 s, aż do skutku.
5. **Rozłącz** wysyła `CLOSE_SESSION` i rozłącza BLE.

Modele protokołu są generowane z `flaps.proto` firmware do
[`src/app/core/protocol/gen`](flaps-configurator-app/src/app/core/protocol/gen) (plik w repo,
build go nie generuje). Po zmianie `flaps.proto` — przy repozytorium firmware obok tego repo
(`../exhaust_flaps_controller`):

```bash
npm run proto:gen
```

Android: skanowanie bez uprawnienia do lokalizacji (Android 12+, `neverForLocation`
w `AndroidManifest.xml`). Emulator nie widzi prawdziwych urządzeń BLE — połączenie testuj na telefonie.

## Jakość kodu

ESLint (flat config, [`eslint.config.js`](flaps-configurator-app/eslint.config.js)) z Prettierem
zintegrowanym jako reguła `prettier/prettier` — błędy formatowania zgłasza linter.

Najważniejsze zasady (wszystkie jako `error`):

- jawny typ zwracany funkcji i metod (`@typescript-eslint/explicit-function-return-type`);
  callbacki przekazywane jako argument mają typ z kontekstu i go nie wymagają
- nieużywane importy (`unused-imports/no-unused-imports`, usuwane przez `--fix`) i zmienne;
  celowo nieużywane nazywaj z prefiksem `_`
- obsługa Promise'ów: `no-floating-promises`, `no-misused-promises`, `await-thenable`, `require-await`
  — nieobsłużony Promise oznacz `void` albo dodaj `.catch()`
- zalecane reguły ESLint, `typescript-eslint` (recommended + stylistic) i Angulara
- dostępność w szablonach HTML (`templateAccessibility`)
- komponenty: sufiks `Page`/`Component`, selektor `app-xxx`

Formatowanie: [`.prettierrc.json`](flaps-configurator-app/.prettierrc.json) — 100 znaków,
pojedyncze cudzysłowy, przecinki na końcu.

**Pre-commit hook** (husky + lint-staged) uruchamia `eslint --fix` na zmienionych plikach `src/**/*.{ts,html}`
i `prettier --write` na pozostałych. Commit z błędami lintera zostanie zablokowany.
Hook instaluje się automatycznie przy `npm install`.

**VS Code:** zainstaluj rekomendowane rozszerzenia (ESLint, Prettier) — formatowanie
i poprawki ESLint wykonują się przy zapisie pliku.

## Pozostałe komendy

| Komenda                | Opis                              |
|------------------------|-----------------------------------|
| `npm start`            | serwer deweloperski               |
| `npm run build`        | build produkcyjny do `www/`       |
| `npm test`             | testy jednostkowe (Vitest)        |
| `npm run lint`         | ESLint + Prettier                 |
| `npm run lint:fix`     | ESLint z automatycznymi poprawkami |
| `npm run format`       | formatowanie całego projektu      |
| `npm run format:check` | sprawdzenie formatowania          |
| `npm run proto:gen`    | generowanie modeli z `flaps.proto` |
