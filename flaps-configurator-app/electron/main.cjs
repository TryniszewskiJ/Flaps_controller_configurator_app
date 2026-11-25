// Proces główny aplikacji desktopowej technika (Flaps Configurator; Windows, macOS). Aplikacja
// użytkownika jest tylko na telefony. Ładuje zbudowaną aplikację (www/) przez protokół app:// i obsługuje to, czego Electron
// nie robi sam przy Web Bluetooth: wybór urządzenia i parowanie z kluczem.

const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  screen,
  shell,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const TITLE = 'Flaps Configurator';
// Domyślny rozmiar okna przy pierwszym uruchomieniu; potem okno pamięta swój (WINDOW_STATE_FILE)
const DEFAULT_WINDOW = { width: 1100, height: 900 };
// Katalog danych (localStorage, stan okna) — %APPDATA%/Flaps Configurator
app.setName(TITLE);

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

const WINDOW_STATE_FILE = 'window-state.json';

/** Rozmiar i pozycja okna z poprzedniego uruchomienia — jeśli nadal mieści się na ekranie. */
function loadWindowState() {
  try {
    const file = path.join(app.getPath('userData'), WINDOW_STATE_FILE);
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { x, y, width, height } = state.bounds ?? {};
    if (![x, y, width, height].every(Number.isFinite)) {
      return null;
    }
    // Monitor odłączony od ostatniego razu — wtedy domyślne położenie
    const visible = screen.getAllDisplays().some(({ workArea: area }) => {
      return (
        x < area.x + area.width &&
        x + width > area.x &&
        y < area.y + area.height &&
        y + height > area.y
      );
    });
    return visible ? { bounds: { x, y, width, height }, maximized: !!state.maximized } : null;
  } catch {
    return null; // pierwsze uruchomienie albo uszkodzony plik
  }
}

function saveWindowState(win) {
  try {
    const file = path.join(app.getPath('userData'), WINDOW_STATE_FILE);
    const state = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    fs.writeFileSync(file, JSON.stringify(state));
  } catch {
    // bez zapisu okno otworzy się następnym razem w domyślnym rozmiarze
  }
}

/** Domyślny rozmiar wariantu, ale nie większy niż obszar roboczy ekranu. */
function defaultBounds() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(DEFAULT_WINDOW.width, width),
    height: Math.min(DEFAULT_WINDOW.height, height),
  };
}

function createWindow() {
  const saved = loadWindowState();
  const win = new BrowserWindow({
    ...(saved?.bounds ?? defaultBounds()),
    minWidth: 360,
    minHeight: 600,
    title: TITLE,
    // Tło przed załadowaniem strony — jak --app-bg motywu systemu
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121417' : '#f4f5f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (saved?.maximized) {
    win.maximize();
  }
  win.on('close', () => saveWindowState(win));

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
 * Automatyczne łączenie z ostatnim urządzeniem (bluetooth:auto-select): wybór bez okna,
 * gdy zapamiętane urządzenie pojawi się na liście.
 */
function setUpBluetooth(win) {
  const { webContents } = win;
  let selectDevice = null;
  let autoSelectId = null;
  let respondToPairing = null;

  webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    if (autoSelectId && devices.some((device) => device.deviceId === autoSelectId)) {
      const deviceId = autoSelectId;
      autoSelectId = null;
      selectDevice = null;
      callback(deviceId);
      return;
    }
    selectDevice = callback;
    webContents.send(
      'bluetooth:devices',
      devices.map((device) => ({ deviceId: device.deviceId, name: advertisedName(device) })),
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
    if (!fromThisWindow(event)) {
      return;
    }
    autoSelectId = null;
    if (selectDevice) {
      selectDevice('');
      selectDevice = null;
    }
  });

  // requestDevice() wymaga aktywacji użytkownika (kliknięcia); przy automatycznym łączeniu
  // po starcie daje ją executeJavaScript(…, userGesture: true)
  ipcMain.handle('bluetooth:auto-select', async (event, deviceId) => {
    if (!fromThisWindow(event)) {
      return;
    }
    autoSelectId = String(deviceId) || null;
    await webContents.executeJavaScript('void 0', true);
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
    ipcMain.removeHandler('bluetooth:auto-select');
  });
}

/**
 * Nazwa z reklamy BLE. Mostek sterownika rozgłasza tylko UUID serwisu — Chromium wstawia wtedy
 * zastępczą nazwę z adresem („Unknown or Unsupported Device (D3:36:…)”, w języku systemu);
 * pusta nazwa = okno wyboru pokaże domyślną („Sterownik klap”).
 */
function advertisedName(device) {
  const name = device.deviceName ?? '';
  return name.includes(device.deviceId) ? '' : name;
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
