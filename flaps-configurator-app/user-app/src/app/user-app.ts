import { Provider } from '@angular/core';
import { APP_ID } from '@flaps/core/connection.service';
import { LANGUAGE_CHOICE } from '@flaps/core/i18n/i18n.service';

/**
 * StartSessionRequest.app_id aplikacji użytkownika ("FLPU"). Sterownik (protokół 1.15+) przyjmie
 * w tej sesji tylko komendy aplikacji użytkownika — stan, ręczne sterowanie, logiki
 * (GET/SET_LOGICS), aktualizację firmware — a na pozostałe odpowie ERROR(UNKNOWN_COMMAND).
 */
export const USER_APP_ID = 0x464c5055;

/** Providery rdzenia, którymi aplikacja użytkownika różni się od aplikacji technika. */
export const USER_PROVIDERS: Provider[] = [
  { provide: APP_ID, useValue: USER_APP_ID },
  // Polski albo angielski — wybór przy pierwszym starcie i w Ustawieniach
  { provide: LANGUAGE_CHOICE, useValue: true },
];
