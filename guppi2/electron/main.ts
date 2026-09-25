import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, protocol, safeStorage, screen, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Gateway, validateKey, type WireRequest } from './gateway';

const APP_HOST = 'app';
const APP_ORIGIN = `guppi://${APP_HOST}`;
const DEV_URL = process.env.GUPPI_DEV_URL; // e.g. http://localhost:5173 during development
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
};
const EXTERNAL_HOSTS = new Set(['neumann-probe.net']);

protocol.registerSchemesAsPrivileged([{ scheme: 'guppi', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const gateway = new Gateway();
let win: BrowserWindow | null = null;
let quitting = false;

const dataDir = () => app.getPath('userData');
const credentialsFile = () => path.join(dataDir(), 'credentials.bin');
const boundsFile = () => path.join(dataDir(), 'window.json');

function isAppUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (DEV_URL) return u.origin === new URL(DEV_URL).origin || u.protocol === 'devtools:';
    return u.protocol === 'guppi:' && u.hostname === APP_HOST && !u.port && !u.username && !u.password;
  } catch {
    return false;
  }
}

function openExternal(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && EXTERNAL_HOSTS.has(u.hostname)) void shell.openExternal(u.toString());
  } catch {
    /* ignore */
  }
}

async function rememberKey(key: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('This system has no secure keychain; the key will only be kept for this session.');
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(credentialsFile(), safeStorage.encryptString(key), { mode: 0o600 });
}

async function loadRememberedKey() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(await fs.readFile(credentialsFile()));
  } catch {
    return null;
  }
}

async function forgetKey() {
  await fs.rm(credentialsFile(), { force: true });
}

async function restoreBounds() {
  try {
    const b = JSON.parse(await fs.readFile(boundsFile(), 'utf8'));
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return b.x < a.x + a.width - 100 && b.x + b.width > a.x + 100 && b.y < a.y + a.height - 100 && b.y + b.height > a.y;
    });
    if (visible && b.width >= 1100 && b.height >= 720) return b as { x: number; y: number; width: number; height: number; maximized?: boolean };
  } catch {
    /* first run or corrupted file */
  }
  return { width: 1480, height: 940 };
}

function registerIpc() {
  const fromApp = (e: Electron.IpcMainInvokeEvent) => !!e.senderFrame && isAppUrl(e.senderFrame.url);
  const guard =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (e: Electron.IpcMainInvokeEvent, ...args: A) => {
      if (!fromApp(e)) throw new Error('Rejected');
      return fn(...args);
    };

  ipcMain.handle(
    'auth:connect',
    guard(async (key: unknown, remember: unknown) => {
      let valid: string;
      try {
        valid = validateKey(key);
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
      gateway.setKey(valid);
      // Remembering is best-effort: without a keychain the key simply stays in memory.
      if (remember === true) await rememberKey(valid).catch(() => undefined);
      return { ok: true as const };
    }),
  );
  ipcMain.handle(
    'auth:status',
    guard(async () => {
      if (!gateway.connected) {
        const k = await loadRememberedKey();
        if (k) {
          try {
            gateway.setKey(k);
          } catch {
            await forgetKey();
          }
        }
      }
      return { connected: gateway.connected, remembered: !!(await loadRememberedKey()) };
    }),
  );
  ipcMain.handle(
    'auth:disconnect',
    guard(async (forget: unknown) => {
      gateway.clearKey();
      if (forget === true) await forgetKey();
    }),
  );
  ipcMain.handle('api:request', guard((id: unknown, req: unknown) => gateway.request(id, req as WireRequest)));
  ipcMain.handle('api:cancel', guard((id: unknown) => typeof id === 'string' && gateway.cancel(id)));
  ipcMain.handle(
    'app:notify',
    guard((title: unknown, body: unknown) => {
      if (typeof title !== 'string' || !Notification.isSupported()) return;
      if (win?.isFocused()) return;
      const n = new Notification({ title: title.slice(0, 120), body: typeof body === 'string' ? body.slice(0, 400) : '' });
      n.on('click', () => (win?.show(), win?.focus()));
      n.show();
    }),
  );
  ipcMain.handle('app:open-external', guard((url: unknown) => typeof url === 'string' && openExternal(url)));
}

async function serveApp() {
  const root = path.join(app.getAppPath(), 'renderer');
  protocol.handle('guppi', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== APP_HOST || request.method !== 'GET') return new Response('Forbidden', { status: 403 });
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) return new Response('Forbidden', { status: 403 });
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      const body = await fs.readFile(target);
      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream',
          'Content-Security-Policy': CSP,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function buildMenu() {
  const send = (action: string) => () => win?.webContents.send('menu', action);
  const views = [
    ['Bridge', 'bridge', '1'],
    ['Fleet', 'fleet', '2'],
    ['Navigation', 'navigation', '3'],
    ['Crew', 'crew', '4'],
    ['Inventory', 'inventory', '5'],
    ['Workshop', 'workshop', '6'],
    ['Automation', 'automation', '7'],
    ['Comms', 'comms', '8'],
    ['Logbook', 'logbook', '9'],
  ] as const;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'File',
        submenu: [
          { label: 'Open the game website', click: () => openExternal('https://neumann-probe.net/') },
          { type: 'separator' },
          { label: 'Command palette', accelerator: 'CommandOrControl+K', click: send('palette') },
          { label: 'Jobs', accelerator: 'CommandOrControl+J', click: send('jobs') },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          ...views.map(([label, view, key]) => ({ label, accelerator: `CommandOrControl+${key}`, click: send(`view:${view}`) })),
          { type: 'separator' },
          { label: 'API console', click: send('view:console') },
          { label: 'Activity', click: send('view:activity') },
          { label: 'Settings', accelerator: 'CommandOrControl+,', click: send('view:settings') },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' },
          ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
        ],
      },
      {
        label: 'Help',
        submenu: [
          { label: 'Game API reference', click: () => openExternal('https://neumann-probe.net/api-docs') },
          {
            label: 'About GUPPI',
            click: () =>
              void dialog.showMessageBox(win!, {
                type: 'info',
                title: 'GUPPI',
                message: `GUPPI ${app.getVersion()}`,
                detail: 'Independent mission control for Neumann Probe. Your API key stays in the main process and, if you choose, in your OS keychain.',
              }),
          },
        ],
      },
    ]),
  );
}

async function createWindow() {
  const bounds = await restoreBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#05070c',
    title: 'GUPPI',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#0a0e17', symbolColor: '#a3aec4', height: 55 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [`--guppi-version=${app.getVersion()}`],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false, // automation keeps its timers while minimised
    },
  });
  if ('maximized' in bounds && bounds.maximized) win.maximize();
  win.once('ready-to-show', () => win?.show());

  win.webContents.setWindowOpenHandler(({ url }) => (openExternal(url), { action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
      openExternal(url);
    }
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  // The renderer asks to block unload while jobs run; confirm with the user.
  win.webContents.on('will-prevent-unload', (e) => {
    if (quitting) return e.preventDefault();
    const choice = dialog.showMessageBoxSync(win!, {
      type: 'question',
      buttons: ['Keep GUPPI open', 'Close anyway'],
      defaultId: 0,
      cancelId: 0,
      title: 'Automation is running',
      message: 'Close GUPPI and stop future automated orders?',
      detail: 'Orders the game already accepted will continue. Nothing new will be sent until you reopen GUPPI.',
    });
    if (choice === 1) e.preventDefault();
  });
  const save = async () => {
    if (!win) return;
    const b = win.getNormalBounds();
    await fs.writeFile(boundsFile(), JSON.stringify({ ...b, maximized: win.isMaximized() })).catch(() => undefined);
  };
  win.on('close', () => void save());
  win.on('closed', () => (win = null));

  await win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  app.on('before-quit', () => (quitting = true));
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // The renderer may only load its own files; all game traffic goes through the gateway.
    session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
      const ok = isAppUrl(details.url) || details.url.startsWith('devtools:') || (DEV_URL !== undefined && details.url.startsWith('ws://'));
      cb({ cancel: !ok });
    });
    registerIpc();
    await serveApp();
    buildMenu();
    await createWindow();
    app.on('activate', () => !BrowserWindow.getAllWindows().length && void createWindow());
  });
  app.on('window-all-closed', () => {
    gateway.clearKey();
    if (process.platform !== 'darwin') app.quit();
  });
}
