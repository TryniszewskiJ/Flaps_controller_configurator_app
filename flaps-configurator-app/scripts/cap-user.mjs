// Capacitor CLI dla aplikacji użytkownika (DK Customs Flaps Control):
//   npm run user:cap -- sync android     (albo: add android, open ios, run android …)
// Ustawia FLAPS_APP=user — capacitor.config.ts wybiera wtedy appId, www-user/ i user-app/android|ios.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('@capacitor/cli/bin/capacitor');

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, FLAPS_APP: 'user' },
});
process.exit(result.status ?? 1);
