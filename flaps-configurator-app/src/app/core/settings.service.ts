import {
  EnvironmentProviders,
  Injectable,
  computed,
  inject,
  provideAppInitializer,
  signal,
} from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Language, isLanguage } from './i18n/i18n';

/** Motyw: 'system' — jak w ustawieniach systemu. */
export type ThemeMode = 'system' | 'light' | 'dark';

/** Sterownik, z którym aplikacja ostatnio się połączyła. */
export interface RememberedDevice {
  /**
   * Identyfikator do ponownego połączenia na tej platformie: adres / UUID Bluetooth
   * na telefonie, identyfikator z okna wyboru Electrona na komputerze.
   */
  deviceId: string;
  name: string;
  /** 96-bitowy UID MCU sterownika w hex (GET_DEVICE_INFO). */
  uid: string;
}

export interface AppSettings {
  /** Język interfejsu; null — jeszcze niewybrany (aplikacja użytkownika zapyta przy starcie). */
  language: Language | null;
  theme: ThemeMode;
  /** Przy starcie aplikacji łącz z ostatnim sterownikiem. */
  autoConnect: boolean;
  lastDevice: RememberedDevice | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: null,
  theme: 'system',
  autoConnect: true,
  lastDevice: null,
};

const STORAGE_KEY = 'flaps.settings';
/** Motyw zapisany przez starsze wersje aplikacji (przed ustawieniami). */
const LEGACY_THEME_KEY = 'flaps.theme';

/**
 * Ustawienia aplikacji zapisane na tym urządzeniu (Capacitor Preferences: na telefonie
 * pamięć ustawień systemu — SharedPreferences / UserDefaults, na komputerze localStorage).
 * Każda aplikacja (technika, użytkownika) ma własne. Wczytywane przed startem aplikacji
 * (`provideAppSettings()` w main.ts) — motyw jest właściwy od pierwszego ekranu.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<AppSettings>(DEFAULT_SETTINGS);
  private writes: Promise<void> = Promise.resolve();

  readonly settings = this._settings.asReadonly();
  readonly language = computed(() => this._settings().language);
  readonly theme = computed(() => this._settings().theme);
  readonly autoConnect = computed(() => this._settings().autoConnect);
  readonly lastDevice = computed(() => this._settings().lastDevice);

  async load(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      this._settings.set(value === null ? migrate() : parse(value));
    } catch {
      this._settings.set(DEFAULT_SETTINGS); // brak dostępu do pamięci — ustawienia domyślne
    }
  }

  setLanguage(language: Language): void {
    this.update({ language });
  }

  setTheme(theme: ThemeMode): void {
    this.update({ theme });
  }

  setAutoConnect(autoConnect: boolean): void {
    this.update({ autoConnect });
  }

  rememberDevice(device: RememberedDevice): void {
    const last = this._settings().lastDevice;
    if (
      last?.deviceId !== device.deviceId ||
      last.name !== device.name ||
      last.uid !== device.uid
    ) {
      this.update({ lastDevice: { ...device } });
    }
  }

  forgetDevice(): void {
    this.update({ lastDevice: null });
  }

  /** Zapisy po kolei — szybkie zmiany nie nadpiszą się w złej kolejności. */
  flush(): Promise<void> {
    return this.writes;
  }

  private update(patch: Partial<AppSettings>): void {
    this._settings.update((settings) => ({ ...settings, ...patch }));
    const value = JSON.stringify(this._settings());
    this.writes = this.writes
      .then(() => Preferences.set({ key: STORAGE_KEY, value }))
      .catch(() => undefined); // bez pamięci ustawienie działa do zamknięcia aplikacji
  }
}

/** Wczytuje ustawienia przed startem aplikacji — do `providers` w main.ts. */
export function provideAppSettings(): EnvironmentProviders {
  return provideAppInitializer(() => inject(SettingsService).load());
}

function parse(value: string): AppSettings {
  try {
    const stored = JSON.parse(value) as unknown;
    if (!stored || typeof stored !== 'object') {
      return DEFAULT_SETTINGS;
    }
    const { language, theme, autoConnect, lastDevice } = stored as Record<string, unknown>;
    return {
      language: isLanguage(language) ? language : null,
      theme: isTheme(theme) ? theme : DEFAULT_SETTINGS.theme,
      autoConnect: typeof autoConnect === 'boolean' ? autoConnect : DEFAULT_SETTINGS.autoConnect,
      lastDevice: parseDevice(lastDevice),
    };
  } catch {
    return DEFAULT_SETTINGS; // uszkodzony wpis
  }
}

function parseDevice(value: unknown): RememberedDevice | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const { deviceId, name, uid } = value as Record<string, unknown>;
  return typeof deviceId === 'string' && deviceId && typeof name === 'string'
    ? { deviceId, name, uid: typeof uid === 'string' ? uid : '' }
    : null;
}

function isTheme(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Pierwsze uruchomienie tej wersji: motyw zapisany wcześniej przez przełącznik w nagłówku. */
function migrate(): AppSettings {
  try {
    const theme = localStorage.getItem(LEGACY_THEME_KEY);
    return isTheme(theme) ? { ...DEFAULT_SETTINGS, theme } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}
