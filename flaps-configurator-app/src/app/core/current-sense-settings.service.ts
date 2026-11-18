import { Injectable, computed, signal } from '@angular/core';
import { CurrentSenseSettings, NO_CURRENT_SENSE, ampOutAmps } from './amp-out';

const STORAGE_KEY = 'flaps.currentSense';

/**
 * Obwód pomiaru prądu (R_shunt, wzmocnienie) — ustawienie aplikacji, zapamiętane na tym
 * urządzeniu. Na razie nieużywane w interfejsie: wartości będą znane po poprawce sprzętu
 * (README firmware, „Co oznacza wartość AMP_OUT”).
 */
@Injectable({ providedIn: 'root' })
export class CurrentSenseSettingsService {
  private readonly _settings = signal<CurrentSenseSettings>(load());

  readonly settings = this._settings.asReadonly();
  /** Czy da się liczyć prąd z AMP_OUT. */
  readonly configured = computed(() => ampOutAmps(1, this._settings()) !== null);

  set(settings: CurrentSenseSettings): void {
    this._settings.set(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // brak dostępu do pamięci — ustawienie działa do zamknięcia aplikacji
    }
  }

  /** Prąd [A] z surowego AMP_OUT; null bez opisu obwodu. */
  amps(raw: number): number | null {
    return ampOutAmps(raw, this._settings());
  }
}

function load(): CurrentSenseSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown;
    if (stored && typeof stored === 'object') {
      const { shuntOhms, gain } = stored as Record<string, unknown>;
      return {
        shuntOhms: typeof shuntOhms === 'number' ? shuntOhms : null,
        gain: typeof gain === 'number' ? gain : null,
      };
    }
  } catch {
    // uszkodzony wpis albo brak dostępu do pamięci
  }
  return NO_CURRENT_SENSE;
}
