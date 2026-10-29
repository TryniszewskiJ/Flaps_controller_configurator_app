# Flaps Controller Configurator App

Aplikacja (Android, iOS, Windows, macOS) do konfiguracji sterownika klap przez Bluetooth Low Energy.

Zbudowana na Ionic + Angular + Capacitor (telefony) i Electron (komputery). Komunikacja BLE przez plugin
[`@capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le) —
na telefonach natywnie, w Electronie przez Web Bluetooth.

> Status: szkielet projektu (szablon Ionic „blank” z dodanym pluginem BLE).

## Spis treści

- [Stack](#stack)
- [Struktura repozytorium](#struktura-repozytorium)
- [Wymagania](#wymagania)
  - [Konfiguracja środowiska (Windows)](#konfiguracja-środowiska-windows)
- [Uruchomienie](#uruchomienie)
  - [W przeglądarce](#w-przeglądarce)
  - [Na Androidzie (emulator lub telefon)](#na-androidzie-emulator-lub-telefon)
  - [Na iPhonie (macOS)](#na-iphonie-macos)
  - [Na komputerze — Windows / macOS (Electron)](#na-komputerze--windows--macos-electron)
- [Połączenie z urządzeniem](#połączenie-z-urządzeniem)
  - [Konfiguracja (zakładka Config)](#konfiguracja-zakładka-config)
- [Jakość kodu](#jakość-kodu)
- [Pozostałe komendy](#pozostałe-komendy)

## Stack

| Element    | Wersja |
|------------|--------|
| Angular    | 22     |
| Ionic      | 9      |
| Capacitor  | 8      |
| Node.js    | 24     |
| JDK        | 21 (wymagany do builda Androida) |
| Android    | minSdk 24, targetSdk 36 |
| iOS        | 15+ (Xcode 26+, tylko na macOS) |
| Electron   | 44 (Windows 10+, macOS) |

## Struktura repozytorium

```
flaps-configurator-app/      # projekt Ionic/Angular
├── src/                     # kod aplikacji (Angular)
├── android/                 # natywny projekt Android (Capacitor)
├── ios/                     # natywny projekt iOS (Capacitor)
├── electron/                # aplikacja desktopowa: proces główny i preload
├── electron-builder.yml     # instalatory Windows / macOS
├── capacitor.config.ts      # konfiguracja Capacitora
└── package.json
```

## Wymagania

- Node.js 24 i npm
- Ionic CLI: `npm install -g @ionic/cli`

**Android** (Windows, macOS, Linux):

- Android Studio z Android SDK (platforma 36) i emulatorem
- **JDK 21** — Gradle 8.14 nie działa na Javie 25/26
  (błąd `Unsupported class file major version 69/70`)

**iOS** (tylko macOS):

- **Xcode 26 lub nowszy** (App Store) — wymóg Capacitora 8; po instalacji uruchom go raz,
  żeby doinstalował komponenty, i zaakceptuj licencję
- **iPhone z iOS 15+** — symulator iOS nie ma Bluetooth, więc połączenie ze sterownikiem
  sprawdzisz tylko na telefonie
- **Apple ID** dodane w Xcode (*Settings → Accounts*). Darmowe konto wystarczy do instalacji
  na własnym telefonie (aplikacja działa wtedy 7 dni, potem trzeba ją wgrać ponownie);
  TestFlight i App Store wymagają płatnego Apple Developer Program
- CocoaPods **nie** jest potrzebne — Capacitor 8 używa Swift Package Manager

**Windows / macOS** (Electron):

- tylko Node.js i npm — Electron instaluje się z `npm install`
- komputer z **Bluetooth 4.0+ (BLE)** i włączonym Bluetooth
- instalator macOS (DMG) da się zbudować tylko na Macu; instalator Windows — na Windows

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

### Na iPhonie (macOS)

Projekt iOS (`ios/`) nie jest jeszcze w repozytorium — trzeba go raz wygenerować.

**Pierwsze uruchomienie:**

1. Dodaj platformę:
   ```bash
   cd flaps-configurator-app
   npm install
   ionic build
   npx cap add ios
   ```
2. Dopisz zgodę na Bluetooth w `ios/App/App/Info.plist` (bez niej aplikacja zamknie się
   przy pierwszym użyciu Bluetooth):
   ```xml
   <key>NSBluetoothAlwaysUsageDescription</key>
   <string>Bluetooth służy do połączenia ze sterownikiem klap.</string>
   ```
3. Zmień `appId` w [`capacitor.config.ts`](flaps-configurator-app/capacitor.config.ts) z domyślnego
   `io.ionic.starter` na własny (np. `com.<nazwa>.flaps`) — Apple wymaga unikalnego identyfikatora
   i odrzuci podpisanie szablonowego. Po zmianie: `npx cap sync`.
4. Podpisywanie: `npx cap open ios` → target **App** → *Signing & Capabilities* → wybierz
   swój **Team** (Apple ID).
5. Na iPhonie: *Ustawienia → Prywatność i ochrona → Tryb dewelopera* (włącz, telefon się
   zrestartuje). Po pierwszej instalacji z darmowego konta zaufaj certyfikatowi:
   *Ustawienia → Ogólne → VPN i urządzenia zarządzane*.
6. Zacommituj katalog `ios/`, żeby kolejne osoby nie musiały powtarzać kroków 1–4.

**Kolejne uruchomienia** (telefon podłączony kablem albo w tej samej sieci Wi-Fi):

```bash
ionic build
npx cap sync ios
npx cap run ios
```

`npx cap run ios --list` pokazuje dostępne urządzenia, `--target <id>` wybiera jedno z nich.
Można też uruchomić aplikację z Xcode (`npx cap open ios`, przycisk ▶).

Przy pierwszym połączeniu ze sterownikiem iOS sam pokaże okno parowania z kluczem — tak jak Android.

### Na komputerze — Windows / macOS (Electron)

Przy pracy nad kodem — z przeładowaniem na żywo:

```bash
cd flaps-configurator-app
npm install
npm run electron:dev
```

`electron:dev` uruchamia `ng serve` (port 4200, inny ustawisz zmienną `ELECTRON_DEV_PORT`)
i Electrona, który ładuje aplikację z tego serwera i otwiera DevTools. Zmiany w `src/` przeładowują
okno same; zmiany w `electron/*.cjs` wymagają ponownego uruchomienia. Zamknięcie okna zatrzymuje też
`ng serve`. Argumenty dla Electrona podaje się po `--`, np. `npm run electron:dev -- --remote-debugging-port=9333`.

Wersja jak w instalatorze — jednorazowy build produkcyjny do `www/` i Electron na tych plikach
(bez obserwowania zmian):

```bash
npm run electron:start
```

Instalatory trafiają do `release/`:

| System  | Komenda                       | Wynik                                   |
|---------|-------------------------------|-----------------------------------------|
| Windows | `npm run electron:dist:win` | `Flaps Configurator-Setup-<wersja>.exe` (NSIS) |
| macOS   | `npm run electron:dist:mac` | `.dmg` (universal: Intel i Apple Silicon) |

Jak działa Bluetooth w wersji desktopowej:

- Łączenie idzie przez Web Bluetooth (Chromium w Electronie). Electron nie ma własnego okna
  wyboru urządzenia — znalezione sterowniki pokazuje to samo okno **Wybierz urządzenie** co na
  telefonie (lista przychodzi z procesu głównego, `electron/main.cjs`).
- Parowanie z kluczem: na **Windows** aplikacja pokaże okno do wpisania kodu, na **macOS**
  okno parowania pokazuje system.
- macOS przy pierwszym połączeniu zapyta o zgodę na Bluetooth dla aplikacji.
- Po ponownym uruchomieniu aplikacji urządzenie trzeba wybrać jeszcze raz (Web Bluetooth
  nie pamięta wyboru między uruchomieniami).

Instalatory nie są podpisane cyfrowo: Windows SmartScreen pokaże ostrzeżenie (*Więcej informacji →
Uruchom mimo to*), a macOS zablokuje pierwsze uruchomienie (*prawy klik → Otwórz*). Do dystrybucji
poza własnymi komputerami potrzebny jest certyfikat podpisu kodu (Windows) i Apple Developer ID
z notaryzacją (macOS).

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
            └─ plugin @capacitor-community/bluetooth-le
                 ├─ Android / iOS — natywny BLE
                 └─ przeglądarka / Electron — Web Bluetooth
```

Web Bluetooth w Electronie nie ma okna wyboru urządzenia ani okna parowania — obsługują je:

| Element | Plik | Rola |
|---|---|---|
| Proces główny | `electron/main.cjs` | protokół `app://` (bezpieczny kontekst, CSP), zdarzenie `select-bluetooth-device` → lista urządzeń, `setBluetoothPairingHandler` → prośba o klucz |
| Preload | `electron/preload.cjs` | `window.flapsDesktop` — tylko funkcje Bluetooth, bez dostępu do Node.js |
| Mostek w aplikacji | `core/ble/desktop-bridge.ts`, `core/ble/desktop-bluetooth.service.ts` | lista urządzeń do okna wyboru, okno wpisania klucza parowania (Windows) |

Poza Electronem `window.flapsDesktop` nie istnieje i aplikacja działa jak na telefonie lub w przeglądarce.

| GATT mostka nRF52 | UUID |
|---|---|
| Serwis (rozgłaszany — po nim filtrowane są „swoje” urządzenia) | `6a756861-9ef3-40e8-b49b-2c98a6bb47fb` |
| RX — zapis aplikacja → STM32 | `63a1f737-d934-4d24-be30-92b242379fb3` |
| TX — notyfikacje STM32 → aplikacja | `52fa30a9-0084-40f5-9782-ef6f0c91206d` |

> README firmware STM32 wymienia Nordic UART Service — mostek używa jednak własnego serwisu
> z tabeli wyżej (źródło: `ble_uart_bridge/src/ble.h`).

Przebieg:

1. **Połącz** otwiera listę sterowników w pobliżu (skan po UUID serwisu; w przeglądarce — okno
   wyboru Web Bluetooth; w Electronie — to samo okno co na telefonie, z listą od procesu głównego).
2. Po wyborze: połączenie BLE, przy pierwszym połączeniu **parowanie z kluczem** (okno systemu na
   Androidzie, iOS i macOS; okno aplikacji w Electronie na Windows), `START_SESSION`, `GET_DEVICE_INFO`.
3. `PING` co ⅓ `session_timeout_ms`. `ERROR(NO_SESSION)` (np. reset STM32) — sesja otwierana
   ponownie; 3 pingi bez odpowiedzi — ponowne połączenie.
4. Utrata połączenia bez kliknięcia **Rozłącz** — ponowne łączenie co 2 s, aż do skutku.
5. **Rozłącz** wysyła `CLOSE_SESSION` i rozłącza BLE.

### Konfiguracja (zakładka Config)

`ConfigurationService` (`core/configuration.service.ts`) po połączeniu odczytuje konfigurację
(`GET_CONFIGURATION`) i trzyma jej wersję roboczą. **Testuj** wysyła ją `SET_CONFIGURATION`
(sterownik używa jej od razu, tylko w RAM), **Zapisz** — `SAVE_CONFIGURATION` (flash, timeout 5 s).

- **Ramki CAN** — ID (hex), standard / extended, timeout (0 = ramka opcjonalna).
- **Sygnały** — okno z siatką bitów 8 × 8 jak w SavvyCAN (wiersz = bajt, kolumny bit 7…0,
  numeracja DBC). Pierwsze dotknięcie wybiera bit, drugie rozciąga zaznaczenie; bity innych
  sygnałów tej ramki są kreskowane, nachodzenie na nie — na czerwono. Położenie liczy
  [`core/can/signal-layout.ts`](flaps-configurator-app/src/app/core/can/signal-layout.ts) tak
  samo jak `SignalExtractor` firmware (Motorola: bit startowy = MSB, Intel: = LSB).
  Przełącznik **bez znaku / ze znakiem** (U2, znak = MSB sygnału) — `Signal.is_signed`,
  protokół 1.5 (starszy firmware pomija to pole).
- **Logiki** — opis, wartość selektora (gdy jest selektor), typ: stała (otwarte / zamknięte),
  przełącznik (wartość otwarcia / zamknięcia) albo histereza (progi). Bez selektora sterownik
  przyjmuje tylko jedną logikę. Ostatniej logiki nie da się usunąć.
- **Ustawienia** — selektor, logika domyślna, stan bezpieczny, czas ruchu klapy (50–5000 ms),
  terminator 120 Ω na CAN.

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
| `npm run electron:dev` | aplikacja desktopowa z przeładowaniem na żywo (`ng serve` + Electron) |
| `npm run electron:start` | aplikacja desktopowa jak w instalatorze (build + Electron) |
| `npm run electron:dist:win` / `:mac` | instalator Windows / macOS do `release/` |
