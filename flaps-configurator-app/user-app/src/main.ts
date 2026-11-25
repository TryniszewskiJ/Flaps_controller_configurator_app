// Aplikacja użytkownika (DK Customs Flaps Control): sterowanie klapami, sygnały i logiki.
// Rdzeń (BLE, protokół, stan, konfiguracja) jest wspólny z aplikacją technika — @flaps/*.
import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { AppComponent } from '@flaps/app.component';
import { routes } from './app/app.routes';
import { provideAppSettings } from '@flaps/core/settings.service';
import { USER_PROVIDERS } from './app/user-app';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    ...USER_PROVIDERS,
    provideAppSettings(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
  ],
}).catch((err: unknown) => console.error(err));
