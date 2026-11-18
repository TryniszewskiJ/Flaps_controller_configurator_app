import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

/** Wybór użytkownika; 'system' — jak w ustawieniach systemu. */
export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'flaps.theme';
const DARK_CLASS = 'ion-palette-dark';

/** Jasny / ciemny motyw: klasa palety Ionic na <html>, wybór zapamiętany w localStorage. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(!!this.media?.matches);
  private readonly _mode = signal<ThemeMode>(readMode());

  readonly mode = this._mode.asReadonly();
  readonly dark = computed(() =>
    this._mode() === 'system' ? this.systemDark() : this._mode() === 'dark',
  );

  constructor() {
    this.media?.addEventListener?.('change', (event) => {
      this.systemDark.set(event.matches);
      this.apply();
    });
    this.apply();
  }

  /** Przełącza na przeciwny do tego, co widać (od tej chwili niezależnie od systemu). */
  toggle(): void {
    this.setMode(this.dark() ? 'light' : 'dark');
  }

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Bez localStorage wybór działa do zamknięcia aplikacji
    }
    this.apply();
  }

  private apply(): void {
    const root = this.document.documentElement;
    const dark = this.dark();
    root.classList.toggle(DARK_CLASS, dark);
    // Paski przewijania i pola formularzy przeglądarki w tym samym motywie
    root.style.colorScheme = dark ? 'dark' : 'light';
  }
}

function readMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}
