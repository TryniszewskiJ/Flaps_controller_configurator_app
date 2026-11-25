import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { SettingsService, ThemeMode } from './settings.service';

export type { ThemeMode } from './settings.service';

const DARK_CLASS = 'ion-palette-dark';

/** Jasny / ciemny motyw: klasa palety Ionic na <html>, wybór w ustawieniach aplikacji. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly settings = inject(SettingsService);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(!!this.media?.matches);

  readonly mode = this.settings.theme;
  readonly dark = computed(() =>
    this.mode() === 'system' ? this.systemDark() : this.mode() === 'dark',
  );

  constructor() {
    this.media?.addEventListener?.('change', (event) => this.systemDark.set(event.matches));
    // Od razu (pierwszy ekran) i przy każdej zmianie motywu albo ustawienia systemu
    this.apply(this.dark());
    effect(() => this.apply(this.dark()));
  }

  setMode(mode: ThemeMode): void {
    this.settings.setTheme(mode);
  }

  private apply(dark: boolean): void {
    const root = this.document.documentElement;
    root.classList.toggle(DARK_CLASS, dark);
    // Paski przewijania i pola formularzy przeglądarki w tym samym motywie
    root.style.colorScheme = dark ? 'dark' : 'light';
  }
}
