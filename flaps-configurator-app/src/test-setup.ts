import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { TECHNICIAN_PROVIDERS } from './app/technician-app';

// Polyfills for running unit tests under jsdom (the default Vitest environment).
// Ionic components such as ion-menu and ion-split-pane query `window.matchMedia`,
// which jsdom does not implement.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Providery Ionic jak w main.ts (np. ModalController używany przez baner połączenia) i rdzenia
// aplikacji technika (app_id, log ramek) — testy aplikacji użytkownika nadpisują APP_ID same
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideIonicAngular(), ...TECHNICIAN_PROVIDERS] });
});
