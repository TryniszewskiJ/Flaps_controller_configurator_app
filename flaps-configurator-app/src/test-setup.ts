import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

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

// Providery Ionic jak w main.ts (np. ModalController używany przez baner połączenia)
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
});
