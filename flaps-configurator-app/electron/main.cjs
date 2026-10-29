// Proces główny aplikacji desktopowej (Windows, macOS).
// Ładuje zbudowaną aplikację (www/) przez protokół app:// i obsługuje to, czego Electron
// nie robi sam przy Web Bluetooth: wybór urządzenia i parowanie z kluczem.

const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const APP_ORIGIN = `${SCHEME}://flaps`;
// Tryb deweloperski (npm run electron:dev): aplikacja z ng serve, z przeładowaniem na żywo.
// Spakowana aplikacja ignoruje zmienną — nie da się jej uruchomić z obcą stroną.
const DEV_URL = app.isPackaged ? undefined : process.env.ELECTRON_DEV_URL;
const ORIGIN = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN;
const WEB_ROOT = path.join(__dirname, '..', 'www');

// Web Bluetooth wymaga bezpiecznego kontekstu; "standard" daje poprawne ścieżki względne
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Tylko własne skrypty; style inline i ikony data: są potrzebne Ionicowi/ionicons
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' data:",
].join('; ');

/** Plik z www/, a dla ścieżek routera Angulara (np. /dashboard) — index.html. */
async function serveApp(request) {
  const { pathname } = new URL(request.url);
  const filePath = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)));
  const insideRoot = filePath.startsWith(WEB_ROOT + path.sep);
  const isFile = insideRoot && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  const target = isFile ? filePath : path.join(WEB_ROOT, 'index.html');

  const response = await net.fetch(pathToFileURL(target).toString());
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  return new Response(response.body, { status: response.status, headers });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 440,
    height: 900,
    minWidth: 360,
    minHeight: 600,
    title: 'Flaps Configurator',
    backgroundColor: '#f4f5f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  setUpBluetooth(win);
  restrictNavigation(win);
  void win.loadURL(`${ORIGIN}/`);
  if (DEV_URL) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

/**
 * navigator.bluetooth.requestDevice(): Electron zgłasza znalezione urządzenia zdarzeniem
 * (wielokrotnie, w miarę skanowania) — lista trafia do okna wyboru w aplikacji,
 * a wybór wraca przez IPC. Pusty deviceId anuluje wybór.
 */
function setUpBluetooth(win) {
  const { webContents } = win;
  let selectDevice = null;
  let respondToPairing = null;

  webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    selectDevice = callback;
    webContents.send(
      'bluetooth:devices',
      devices.map((device) => ({ deviceId: device.deviceId, name: device.deviceName })),
    );
  });

  // Parowanie z kluczem na Windows/Linux (na macOS okno pokazuje system)
  webContents.session.setBluetoothPairingHandler((details, callback) => {
    respondToPairing = callback;
    webContents.send('bluetooth:pairing', { kind: details.pairingKind, pin: details.pin });
  });

  const fromThisWindow = (event) => event.sender === webContents;

  ipcMain.on('bluetooth:select', (event, deviceId) => {
    if (fromThisWindow(event) && selectDevice) {
      selectDevice(String(deviceId));
      selectDevice = null;
    }
  });

  ipcMain.on('bluetooth:cancel', (event) => {
    if (fromThisWindow(event) && selectDevice) {
      selectDevice('');
      selectDevice = null;
    }
  });

  ipcMain.on('bluetooth:pairing-response', (event, response) => {
    if (fromThisWindow(event) && respondToPairing) {
      respondToPairing({ confirmed: Boolean(response?.confirmed), pin: response?.pin });
      respondToPairing = null;
    }
  });

  win.on('closed', () => {
    ipcMain.removeAllListeners('bluetooth:select');
    ipcMain.removeAllListeners('bluetooth:cancel');
    ipcMain.removeAllListeners('bluetooth:pairing-response');
  });
}

/** Aplikacja nie opuszcza app://; linki zewnętrzne otwierają się w przeglądarce. */
function restrictNavigation(win) {
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, serveApp);

  // Windows: bez paska menu; macOS: domyślne menu (Cmd+Q, kopiuj/wklej)
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
