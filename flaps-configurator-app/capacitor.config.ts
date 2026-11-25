import type { CapacitorConfig } from '@capacitor/cli';

// Dwie aplikacje z jednego projektu: technika (domyślna, android/ i ios/) i użytkownika
// (FLAPS_APP=user, natywne projekty w user-app/). Komendy dla aplikacji użytkownika:
// npm run user:cap -- sync android (scripts/cap-user.mjs ustawia zmienną).
const user = process.env['FLAPS_APP'] === 'user';

const config: CapacitorConfig = user
  ? {
      appId: 'com.dkcustoms.flapsControl',
      appName: 'DK Customs Flaps Control',
      webDir: 'www-user',
      android: { path: 'user-app/android' },
      ios: { path: 'user-app/ios' },
    }
  : {
      appId: 'com.dkcustoms.flapsConfigurator',
      appName: 'flaps-configurator-app',
      webDir: 'www',
    };

export default config;
