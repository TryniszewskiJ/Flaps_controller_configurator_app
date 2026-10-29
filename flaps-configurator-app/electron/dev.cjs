// npm run electron:dev — ng serve (watch) + Electron ładujący aplikację z serwera deweloperskiego.
// Zmiany w src/ przeładowują okno same; zmiany w electron/*.cjs wymagają ponownego uruchomienia.
// Argumenty po `--` trafiają do Electrona, np. npm run electron:dev -- --remote-debugging-port=9333

const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const electronBinary = require('electron');

const PORT = Number(process.env.ELECTRON_DEV_PORT ?? 4200);
const DEV_URL = `http://localhost:${PORT}`;
const PROJECT_ROOT = path.join(__dirname, '..');
const NG_CLI = path.join(PROJECT_ROOT, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const STARTUP_TIMEOUT_MS = 120_000;

const children = [];

function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd: PROJECT_ROOT, stdio: 'inherit', ...options });
  children.push(child);
  return child;
}

/** Zamyka proces razem z potomkami (ng serve uruchamia własne procesy, np. esbuild). */
function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) {
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown(code) {
  children.forEach(killTree);
  process.exit(code);
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (response) => {
          response.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() > deadline) {
            reject(new Error(`Serwer ${url} nie wystartował w ${timeoutMs / 1000} s`));
          } else {
            setTimeout(attempt, 500);
          }
        });
    };
    attempt();
  });
}

async function main() {
  const ng = start(process.execPath, [NG_CLI, 'serve', '--port', String(PORT)]);
  ng.on('exit', (code) => shutdown(code ?? 0));

  await waitForServer(DEV_URL, STARTUP_TIMEOUT_MS);

  const electron = start(electronBinary, ['.', ...process.argv.slice(2)], {
    env: { ...process.env, ELECTRON_DEV_URL: DEV_URL },
  });
  electron.on('exit', (code) => shutdown(code ?? 0));
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((error) => {
  console.error(error.message);
  shutdown(1);
});
