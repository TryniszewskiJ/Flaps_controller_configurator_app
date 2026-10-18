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
