# Flaps Controller Configurator App

Dwie aplikacje do sterownika klap przez Bluetooth Low Energy:

| Aplikacja | Dla kogo | Platformy | Co ma |
|---|---|---|---|
| **Flaps Configurator** (`src/`) | technik — montaż i konfiguracja | Android, iOS, Windows, macOS | pełna konfiguracja (ramki CAN, sygnały, logiki, ustawienia), CAN bus, Dev console, aktualizacja firmware |
| **DK Customs Flaps Control** (`user-app/`) | kierowca | Android, iOS | stan klap i przełącznik Auto / Otwarte / Zamknięte, dane z auta, tryby jazdy, aktualizacja firmware; polski i angielski — patrz [Aplikacja użytkownika](#aplikacja-użytkownika) |

Obie są w jednym projekcie Angulara i dzielą rdzeń (`src/app/core` — BLE, protokół, stan, konfiguracja)
oraz wspólne komponenty.

Zbudowana na Ionic + Angular + Capacitor (telefony) i Electron (komputery). Komunikacja BLE przez plugin
[`@capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le) —
na telefonach natywnie, w Electronie przez Web Bluetooth.

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
- [Aplikacja użytkownika](#aplikacja-użytkownika)
  - [Budowanie i wdrażanie aplikacji użytkownika](#budowanie-i-wdrażanie-aplikacji-użytkownika)
- [Połączenie z urządzeniem](#połączenie-z-urządzeniem)
  - [Konfiguracja (zakładka Config)](#konfiguracja-zakładka-config)
  - [Stan, ręczne sterowanie i tryb deweloperski](#stan-ręczne-sterowanie-i-tryb-deweloperski)
  - [Aktualizacja firmware (zakładka Aktualizacja)](#aktualizacja-firmware-zakładka-aktualizacja)
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
flaps-configurator-app/        # projekt Ionic/Angular (dwie aplikacje: `app` i `user`)
├── src/                       # aplikacja technika + kod wspólny (src/app/core, shared, …)
├── android/  ios/             # natywne projekty aplikacji technika (Capacitor)
├── user-app/
│   ├── src/                   # aplikacja użytkownika (importuje kod wspólny przez @flaps/*)
│   └── android/  ios/         # natywne projekty aplikacji użytkownika
├── electron/                  # aplikacja desktopowa technika: proces główny i preload
├── electron-builder.yml       # instalatory aplikacji technika
├── capacitor.config.ts        # Capacitor: technik, a z FLAPS_APP=user — użytkownik
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

Projekt iOS jest w repozytorium (`ios/`, bundle ID `com.dkcustoms.flapsConfigurator`, zgoda na
Bluetooth w `Info.plist`).

**Pierwsze uruchomienie na danym Macu i telefonie:**

1. Podpisywanie: `npx cap open ios` → target **App** → *Signing & Capabilities* → wybierz
   swój **Team** (Apple ID). W repozytorium jest zapisany Team autora projektu — przy innym koncie
   zmień go na swój.
2. Na iPhonie: *Ustawienia → Prywatność i ochrona → Tryb dewelopera* (włącz, telefon się
   zrestartuje). Po pierwszej instalacji z darmowego konta zaufaj certyfikatowi:
   *Ustawienia → Ogólne → VPN i urządzenia zarządzane*.

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
- Po ponownym uruchomieniu aplikacja sama łączy się z ostatnim sterownikiem (ustawienie
  **Łącz automatycznie z ostatnim sterownikiem**, patrz [Ustawienia aplikacji](#ustawienia-aplikacji)).
- Okno pamięta rozmiar i pozycję (`window-state.json` w danych aplikacji); przy pierwszym
  uruchomieniu ma 1100 × 900.

Wersja desktopowa jest tylko dla aplikacji technika — aplikacja użytkownika jest na telefony.

Instalatory nie są podpisane cyfrowo: Windows SmartScreen pokaże ostrzeżenie (*Więcej informacji →
Uruchom mimo to*), a macOS zablokuje pierwsze uruchomienie (*prawy klik → Otwórz*). Do dystrybucji
poza własnymi komputerami potrzebny jest certyfikat podpisu kodu (Windows) i Apple Developer ID
z notaryzacją (macOS).

## Aplikacja użytkownika

**DK Customs Flaps Control** (`com.dkcustoms.flapsControl`) — uproszczona aplikacja dla kierowcy,
w tym samym stacku co aplikacja technika (projekt `user` w `angular.json`, katalog `user-app/`).
Wymaga firmware z protokołem **1.15** — starszy sterownik odpowie, że nie obsługuje tej aplikacji
(komunikat „potrzebna aktualizacja firmware (serwis)”), firmware aktualizuje wtedy technik.

Zakładki:

- **Klapy** (dashboard) — stan klap (duży napis + każda klapa), kto steruje (logika z nazwą trybu, ręcznie,
  stan bezpieczny), dane z auta (kafelki; nieaktualne wartości wyszarzone). Przełącznik **Auto | Otwarte | Zamknięte** pokazuje bieżący
  tryb: **Auto** = steruje logika (`SET_FLAPS_OVERRIDE` ze stanem `UNSPECIFIED`),
  **Otwarte / Zamknięte** = ręcznie, domyślnie **na stałe** (do powrotu na Auto albo resetu sterownika; rozłączenie telefonu
  go nie kończy), do wyboru też na 10 / 5 / 1 min. Zmiana czasu przy sterowaniu ręcznym obowiązuje
  od razu.
- **Tryby** (tryby jazdy = logiki) — lista i edycja (ten sam edytor co u technika: stała, przełącznik,
  histereza, warunek). Kierowca zmienia tylko działanie trybu: nazwa jest tylko do odczytu, a sygnał
  wejściowy jest ukryty — oba ustawia technik (opcje `lockName` i `hideInput` edytora; „Warunek”
  da się wybrać tylko dla trybu, który już nim jest). Selektor, logikę domyślną, ramki, sygnały i ustawienia ustawia technik;
  bez selektora nie da się dodać kolejnej logiki. Tryby są czytane po połączeniu (bez przycisku
  „Odśwież”). **Zapisz** = `SET_LOGICS { save }` (od razu na stałe, do flasha); opcja drugorzędna
  **Wypróbuj bez zapisywania** = `SET_LOGICS` (działa do restartu sterownika).
- **Aktualizacja** — ta sama strona co u technika (wgranie `.bin`, restart, tryb ratunkowy).
- **Ustawienia** — wspólna strona obu aplikacji (opis niżej, „Ustawienia aplikacji”).

### Języki

Aplikacja użytkownika jest po polsku i po angielsku. Przy pierwszym uruchomieniu pyta o język
(okno po angielsku), wybór zapisuje w ustawieniach; zmiana w **Ustawieniach** działa od razu.
Aplikacja technika jest zawsze po polsku (token `LANGUAGE_CHOICE` w
[`user-app.ts`](flaps-configurator-app/user-app/src/app/user-app.ts)).

Teksty są w słownikach [`core/i18n/pl.ts`](flaps-configurator-app/src/app/core/i18n/pl.ts)
i [`en.ts`](flaps-configurator-app/src/app/core/i18n/en.ts) — kompilator sprawdza, że angielski ma
każdy klucz polskiego. W szablonie `{{ 'klucz' | t }}` (z parametrami `| t: { name }`), w kodzie
`t('klucz', { name })`. Słowniki obejmują kod wspólny i aplikację użytkownika; strony tylko dla
technika (Config, CAN bus, Dev console) mają teksty wpisane po polsku.

### Ustawienia aplikacji

Zakładka **Ustawienia** w obu aplikacjach
([`shared/settings`](flaps-configurator-app/src/app/shared/settings)):

- **Język** (tylko aplikacja użytkownika) — polski / angielski.
- **Wygląd** — motyw jak w systemie / jasny / ciemny.
- **Łącz automatycznie z ostatnim sterownikiem** (domyślnie włączone) — po uruchomieniu aplikacja
  sama łączy się z ostatnio używanym sterownikiem (`AutoConnectService`). Zapamiętywany jest po
  każdym udanym połączeniu: identyfikator Bluetooth, nazwa i UID MCU; **Zapomnij** go usuwa.
  Telefon łączy się po adresie (Android) / UUID (iOS) bez skanowania; aplikacja desktopowa
  technika uruchamia wybór urządzenia, a proces główny Electrona sam wskazuje zapamiętane, gdy
  pojawi się w skanowaniu (do 10 s). W przeglądarce niedostępne — Web Bluetooth zawsze pokazuje
  okno wyboru.

Ustawienia zapisuje `SettingsService` przez Capacitor Preferences (telefon: SharedPreferences /
UserDefaults, komputer i przeglądarka: `localStorage`), osobno dla każdej aplikacji. Są wczytywane
przed startem aplikacji (`provideAppSettings()` w `main.ts`), więc motyw jest właściwy od
pierwszego ekranu.

**Izolacja od aplikacji technika.** Aplikacja użytkownika nie pobiera konfiguracji i nie zna
reszty protokołu:

- Łączy się z własnym `app_id` (`USER_APP_ID` w
  [`user-app/src/app/user-app.ts`](flaps-configurator-app/user-app/src/app/user-app.ts)) —
  sterownik przyjmuje w tej sesji tylko jej komendy (README firmware, „Aplikacja użytkownika”).
- Logiki czyta i zapisuje przez `GET_LOGICS` / `SET_LOGICS` (`LogicsService`,
  [`user-app/src/app/core/logics.service.ts`](flaps-configurator-app/user-app/src/app/core/logics.service.ts)):
  dostaje tylko logiki, logikę domyślną, selektor i nazwy sygnałów.
- Protokół jest podzielony na pliki (`flaps_common`, `flaps_state`, `flaps_logic`,
  `flaps_firmware`, `flaps_user`, `flaps` — tylko technik). Kod wspólny i aplikacja użytkownika
  importują tylko potrzebne pliki z `core/protocol/gen`; kod technika — cały protokół z
  `core/protocol/messages.ts`.
- Z aplikacji technika używa tylko kodu wspólnego (alias `@flaps/*` → `src/app/*`): połączenie
  i BLE, `DeviceStateService` (stan, ręczne sterowanie), aktualizacja firmware, `shared/`
  (baner połączenia, wybór urządzenia, edytor logik), strona Aktualizacja. Narzędzia technika
  są osobno: `DevTelemetryService` (logi, AMP_OUT, ruchy klap), `DevCommandService` (komendy
  z Dev console), log ramek (podpinany tokenem `FRAME_OBSERVER` w `technician-app.ts`).
- Pilnują tego: **ESLint** (`no-restricted-imports` w
  [`eslint.config.js`](flaps-configurator-app/eslint.config.js) — lista plików wspólnych
  i kodu tylko dla technika) oraz **`scripts/check-user-bundle.mjs`** (uruchamiany przez
  `npm run user:build`) — kończy build błędem, gdy w bundlu aplikacji użytkownika jest opis
  `flaps.proto`, nazwy z konfiguracji / CAN sniff / AMP_OUT albo `app_id` technika.

### Budowanie i wdrażanie aplikacji użytkownika

Aplikacja użytkownika jest tylko na telefony (Android, iOS) — bez wersji desktopowej.
Wszystkie komendy z katalogu `flaps-configurator-app/`. Wymagania (Node, JDK 21, Android SDK,
Xcode) są te same co dla aplikacji technika — patrz [Wymagania](#wymagania).

| Komenda | Opis |
|---|---|
| `npm run user:start` | serwer deweloperski w przeglądarce (port 4201) |
| `npm run user:build` | build produkcyjny do `www-user/` + kontrola izolacji bundla |
| `npm run user:test` | testy jednostkowe aplikacji użytkownika |
| `npm run user:cap -- <komenda>` | Capacitor dla aplikacji użytkownika (`sync`, `run android`, `open ios`, …) |

**Jak to działa.** `user:cap` ([`scripts/cap-user.mjs`](flaps-configurator-app/scripts/cap-user.mjs))
uruchamia Capacitor CLI ze zmienną `FLAPS_APP=user` — wtedy
[`capacitor.config.ts`](flaps-configurator-app/capacitor.config.ts) bierze appId
`com.dkcustoms.flapsControl`, nazwę **DK Customs Flaps Control**, pliki z `www-user/` i natywne
projekty z `user-app/android` i `user-app/ios`. Zwykłe `npx cap …` (bez `user:`) dotyczy aplikacji
technika. Obie aplikacje mają różne identyfikatory, więc można je zainstalować obok siebie na
jednym telefonie; każda ma własne ustawienia.

Za każdym razem przed wdrożeniem: **najpierw `npm run user:build`, potem `sync`** — Capacitor
kopiuje do projektu natywnego to, co jest w `www-user/`, więc bez świeżego builda telefon dostanie
starą wersję.

#### Android — telefon podłączony kablem

1. Na telefonie włącz *Opcje programisty → Debugowanie USB* i podłącz go kablem
   (`adb devices` powinno go pokazać).
2. Pierwszy raz na danym komputerze: w `user-app/android/local.properties` ustaw ścieżkę do SDK
   (`sdk.dir=…`, jak w [Konfiguracji środowiska](#konfiguracja-środowiska-windows)) albo otwórz
   projekt w Android Studio (`npm run user:cap -- open android`) — utworzy ten plik sam.
3. Zbuduj i uruchom:
   ```bash
   npm run user:build
   npm run user:cap -- sync android
   npm run user:cap -- run android
   ```
   `npm run user:cap -- run android --list` pokazuje urządzenia, `--target <id>` wybiera jedno.

#### Android — plik APK do przekazania (testy)

```bash
npm run user:build
npm run user:cap -- sync android
cd user-app/android
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
```

Plik: `user-app/android/app/build/outputs/apk/debug/app-debug.apk`. Instalacja:
`adb install -r app-debug.apk` albo skopiuj plik na telefon i otwórz go (Android zapyta o zgodę na
instalację z nieznanego źródła). APK debug jest podpisany kluczem deweloperskim tego komputera —
nadaje się do testów; aktualizacja APK zbudowanym na innym komputerze wymaga najpierw odinstalowania
aplikacji.

#### Android — wersja do wydania (Google Play / instalacja u klientów)

1. Podnieś wersję w [`user-app/android/app/build.gradle`](flaps-configurator-app/user-app/android/app/build.gradle):
   `versionCode` (liczba, musi rosnąć z każdym wydaniem) i `versionName` (np. `"1.1"`).
2. Klucz podpisu — raz, przechowuj go bezpiecznie poza repozytorium (pliki `*.jks` / `*.keystore`
   są w `.gitignore`):
   ```bash
   keytool -genkeypair -v -keystore dk-customs-flaps-control.jks -alias flaps-control -keyalg RSA -keysize 2048 -validity 10000
   ```
   Utrata klucza (albo hasła) oznacza, że nie da się już wydać aktualizacji tej aplikacji —
   trzeba by publikować nową pod innym identyfikatorem. W Google Play warto włączyć *Play App
   Signing* — wtedy Google przechowuje klucz podpisu wydań.
3. `npm run user:build && npm run user:cap -- sync android`, potem `npm run user:cap -- open android`
   i w Android Studio *Build → Generate Signed App Bundle or APK*:
   - **Android App Bundle (`.aab`)** — do Google Play,
   - **APK (release)** — do instalacji bezpośrednio z pliku.

#### iPhone (tylko macOS)

Projekt jest w repozytorium (`user-app/ios`, bundle ID `com.dkcustoms.flapsControl`, zgoda na
Bluetooth w `Info.plist`). Symulator iOS nie ma Bluetooth — połączenie sprawdzisz tylko na telefonie.

1. Pierwszy raz: `npm run user:cap -- open ios` → target **App** → *Signing & Capabilities* →
   wybierz swój **Team**. Na iPhonie włącz *Tryb dewelopera* i (przy darmowym koncie) zaufaj
   certyfikatowi — tak jak dla [aplikacji technika](#na-iphonie-macos).
2. Zbuduj i uruchom (telefon kablem albo w tej samej sieci Wi-Fi):
   ```bash
   npm run user:build
   npm run user:cap -- sync ios
   npm run user:cap -- run ios
   ```
   albo w Xcode przyciskiem ▶ (`npm run user:cap -- open ios`).
3. Wydanie (TestFlight / App Store, wymaga płatnego Apple Developer Program): podnieś
   *Version* (`MARKETING_VERSION`) i *Build* (`CURRENT_PROJECT_VERSION`) w *General* targetu
   **App**, potem *Product → Archive* → *Distribute App*.

Przy darmowym Apple ID aplikacja działa 7 dni — potem trzeba ją wgrać ponownie.

#### Przed wydaniem

```bash
npm run user:test
npm run lint
npm run user:build      # kończy się błędem, gdy do aplikacji trafił kod technika
```

Po stronie sterownika aplikacja wymaga firmware z protokołem **1.15** (0.2.9+). Żeby w trybie
ratunkowym działała też aplikacja użytkownika, bootloader musi być z tej samej wersji (wgrywany
ST-Linkiem — patrz CHANGELOG firmware); ze starszym bootloaderem tryb ratunkowy obsłuży tylko
aplikacja technika.

Logo DK Customs w nagłówku: [`user-app/src/assets/dk-customs-logo.png`](flaps-configurator-app/user-app/src/assets/dk-customs-logo.png)
(trafia tylko do aplikacji użytkownika, jako `assets/user/`). Ikona aplikacji na telefonie i komputerze
jest na razie wspólna z aplikacją technika (`icons/`).

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
- **Wyjścia klap** (w Ustawieniach, protokół 1.7) — dla każdego wyjścia silnika: *podłączona*
  (jedna klapa = wyłączone drugie wyjście, co najmniej jedno musi zostać) i *odwrócony kierunek
  silnika* (zamiast przekładania przewodów). Kierunek najprościej sprawdzić przyciskiem
  **Otwórz klapy** — jeśli klapa się zamyka, odwróć ją. W protobufie `Configuration.flap1` /
  `flap2` (`FlapOutput { disconnected, reversed }`); brak pola od starszego firmware =
  podłączona, zwykły kierunek.
- **Tryb demo** (w Ustawieniach, protokół 1.8) — `Configuration.demo_mode`: sterownik odtwarza
  65-sekundowy przejazd (CAN w internal loopback) zamiast słuchać auta. Działa tylko, gdy w
  sesji jest włączony tryb deweloperski (logi albo przebieg AMP_OUT) i z ramkami konfiguracji
  domyślnej. Dashboard pokazuje wtedy pasek „Tryb demo”.

### Stan, ręczne sterowanie i tryb deweloperski

`DeviceStateService` (`core/device-state.service.ts`) po każdym starcie sesji (także ponownym
po `NO_SESSION`) wywołuje `GET_STATE`, a potem nakłada zmiany z `TELEMETRY` (sygnały) i `EVENT`
(aktywna logika, ruch klap, ręczne sterowanie). Luka we wspólnym liczniku `sequence` — stan
od nowa (`GET_STATE`). Logi, AMP_OUT i ruchy klap z diagnostyką zbiera osobno
`DevTelemetryService` (`core/dev-telemetry.service.ts`, tylko aplikacja technika).

- **Dashboard** pokazuje aktywną logikę (lub stan bezpieczny), położenie obu klap
  (niepodłączone wyjście: „Niepodłączona”) i sygnały — nazwy z konfiguracji urządzenia.
- **Otwórz / Zamknij klapy** wysyła `SET_FLAPS_OVERRIDE` na wybrany czas (1 / 5 / 10 min, firmware
  przyjmuje do 10 min) albo **na stałe** (`permanent`, protokół 1.15 — do oddania sterowania albo
  resetu sterownika); działa także w stanie bezpiecznym. Aktywne sterowanie ręczne widać z
  odliczaniem (stałe — bez), **Oddaj logice** kończy je od razu. Zamknięcie aplikacji go nie
  kończy — kończy je czas albo reset.
- **Dev console → Tryb deweloperski** — `SET_DEV_MODE`: poziom logów sterownika i przebieg AMP_OUT
  po każdym ruchu klapy. Sterownik wyłącza tryb przy każdym `START_SESSION`, aplikacja włącza go
  ponownie sama.
- **Dev console → Ruchy klap · AMP_OUT** — tabela ruchów: czas, klapa i kierunek, trwanie, szczyt
  prądu i prąd przy zatrzymaniu (z `EVENT flap_move_finished`, zawsze), a po rozwinięciu —
  próbki przebiegu z `FLAP_TRACE` (tryb dev). AMP_OUT to surowy odczyt ADC (0–65535); napięcie
  liczone przy VREF 3,3 V ([`core/amp-out.ts`](flaps-configurator-app/src/app/core/amp-out.ts)).
- **Dev console → Logi sterownika** — linie `LOG` z czasem od startu sterownika i poziomem.

### Aktualizacja firmware (zakładka Aktualizacja)

Nowy firmware wgrywa się przez BLE, bez ST-Linka (protokół 1.9, bootloader w firmware — README
firmware „Bootloader i aktualizacja firmware”).

1. **Wybierz plik .bin** — `build/<preset>/exhaust_flaps_controller.bin` z buildu firmware, z pamięci
   telefonu albo dysku komputera (systemowe okno wyboru pliku). Aplikacja od razu sprawdza nagłówek
   obrazu (`FAPH`, płytka `EFC1`, adres `0x08020000`), rozmiar i CRC-32 — jak
   `tools/firmware_image.py --check` — i pokazuje wersję z pliku. Ostrzega, gdy to ta sama albo
   starsza wersja niż na sterowniku.
2. **Wgraj firmware** (z potwierdzeniem): `FIRMWARE_UPDATE_BEGIN` (kasowanie stagingu, timeout
   30 s) → `FIRMWARE_UPDATE_DATA` po jednej paczce 1 KB, zawsze czekając na odpowiedź → `COMMIT`.
   Postęp widać na pasku. Klapy działają normalnie przez całe pobieranie; ping jest w tym czasie
   wstrzymany (każda paczka i tak przedłuża sesję, a ping wpleciony w dużą ramkę BLE by ją rozbił).
3. Po `COMMIT` sterownik się restartuje, a bootloader instaluje obraz. Aplikacja zostaje połączona
   przez BLE, wysyła `START_SESSION` co ~1 s (do 45 s) i pokazuje wersję przed i po.

**Przerwij** (do `COMMIT`) wysyła `FIRMWARE_UPDATE_ABORT`. Odrzucony obraz (CRC, inna płytka) i
zerwane połączenie też kończą aktualizację — sterownik zostaje na dotychczasowym firmware. Logika
w [`core/firmware/`](flaps-configurator-app/src/app/core/firmware) (`firmware-image.ts`,
`firmware-update.service.ts`).

**Tryb ratunkowy (bootloader).** Gdy `GET_DEVICE_INFO` zwraca `mode: BOOTLOADER` (uszkodzony
firmware, pętla resetów albo `REBOOT { to_bootloader }`), aplikacja nie czyta konfiguracji ani stanu,
przechodzi do zakładki Aktualizacja i pokazuje na każdej stronie ostrzeżenie, że klapy nie są
sterowane. Karta **Restart**: *Uruchom ponownie*, *Tryb ratunkowy* (`REBOOT`), a w bootloaderze
*Uruchom firmware*.

Ramki protokołu mogą mieć do 2048 B payloadu (limit firmware) — paczka aktualizacji to ok. 1 KB.

Modele protokołu są generowane z `flaps*.proto` firmware do
[`src/app/core/protocol/gen`](flaps-configurator-app/src/app/core/protocol/gen) — jeden plik
`*_pb.ts` na plik proto (w repo, build ich nie generuje). Po zmianie proto — przy repozytorium
firmware obok tego repo
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
| `npm run user:…` | to samo dla aplikacji użytkownika — patrz [Aplikacja użytkownika](#aplikacja-użytkownika) |
