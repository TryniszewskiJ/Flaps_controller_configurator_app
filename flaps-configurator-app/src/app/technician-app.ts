import { Provider } from '@angular/core';
import { APP_ID, FRAME_OBSERVER } from './core/connection.service';
import { FrameLogService } from './core/frame-log.service';

/** StartSessionRequest.app_id aplikacji technika ("FLAP") — sterownik przyjmie każdą komendę. */
export const TECHNICIAN_APP_ID = 0x464c4150;

/** Providery rdzenia, którymi aplikacja technika różni się od aplikacji użytkownika. */
export const TECHNICIAN_PROVIDERS: Provider[] = [
  { provide: APP_ID, useValue: TECHNICIAN_APP_ID },
  // Log ramek w Dev console widzi każdą wysłaną i odebraną ramkę
  { provide: FRAME_OBSERVER, useExisting: FrameLogService },
];
