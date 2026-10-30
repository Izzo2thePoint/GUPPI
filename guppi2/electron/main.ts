import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, protocol, safeStorage, screen, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { Gateway, validateKey, type WireRequest } from './gateway';
import { createEventHub, createRemoteServer, RemoteCallError, type AgentScope } from './remote-server';
import { readLatestRelease, RELEASES_API, type UpdateCheck } from './updates';

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
// The only sites GUPPI will open in the browser: the game, and the project's own GitHub pages.
const EXTERNAL_HOSTS = new Set(['neumann-probe.net', 'github.com']);

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
    if (u.protocol !== 'https:' || !EXTERNAL_HOSTS.has(u.hostname)) return;
    // github.com: only this project's pages.
    if (u.hostname === 'github.com' && !u.pathname.startsWith('/Izzo2thePoint/GUPPI')) return;
    void shell.openExternal(u.toString());
  } catch {
    /* ignore */
  }
}

/**
 * Asks GitHub for the latest release. Only ever runs when the player asks for
 * it (Settings → Check for updates, or Help → Check for updates…); GUPPI makes
 * no other request outside the game.
 */
async function checkForUpdates(): Promise<UpdateCheck> {
  const current = app.getVersion();
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `GUPPI/${current}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { current, error: `GitHub answered HTTP ${res.status}. Try again later.` };
    return readLatestRelease(await res.json(), current);
  } catch {
    return { current, error: 'Could not reach GitHub. Check your connection and try again.' };
  }
}

async function showUpdateDialog() {
  const r = await checkForUpdates();
  if (r.error) return void dialog.showMessageBox(win!, { type: 'warning', title: 'Check for updates', message: 'Could not check for updates', detail: r.error });
  if (!r.newer) return void dialog.showMessageBox(win!, { type: 'info', title: 'Check for updates', message: `GUPPI ${r.current} is up to date`, detail: 'You have the latest release.' });
  const { response } = await dialog.showMessageBox(win!, {
    type: 'info',
    title: 'Check for updates',
    message: `GUPPI ${r.latest} is available`,
    detail: `You have ${r.current}. The download page opens in your browser; GUPPI does not update itself.`,
    buttons: ['Open download page', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0 && r.url) openExternal(r.url);
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

// ── Phone remote (opt-in) ──────────────────────────────────────────────────

/** `bind`: the address the server listens on; '' means every network interface. */
type RemoteConfig = { enabled: boolean; port: number; token: string; agents: AgentScope; dangerous: boolean; bind: string };
const LOCAL_ONLY = '127.0.0.1';
const SCOPES: AgentScope[] = ['off', 'read', 'control'];
/** Recent agent events (jobs, arrivals, alerts, missiles) for /api/v1/events. */
const agentEvents = createEventHub();
const remoteFile = () => path.join(dataDir(), 'remote.json');
const newToken = () => randomBytes(24).toString('base64url');
let remoteCfg: RemoteConfig | null = null;
let remoteServer: ReturnType<typeof createRemoteServer> | null = null;
let remoteError: string | null = null;
const pendingRemote = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: NodeJS.Timeout }>();

async function loadRemoteConfig(): Promise<RemoteConfig> {
  if (remoteCfg) return remoteCfg;
  try {
    const v = JSON.parse(await fs.readFile(remoteFile(), 'utf8'));
    remoteCfg = {
      enabled: v.enabled === true,
      port: Number.isInteger(v.port) ? v.port : 47811,
      token: typeof v.token === 'string' && v.token.length >= 24 ? v.token : newToken(),
      agents: SCOPES.includes(v.agents) ? v.agents : 'off',
      dangerous: v.dangerous === true,
      bind: typeof v.bind === 'string' ? v.bind : '',
    };
  } catch {
    remoteCfg = { enabled: false, port: 47811, token: newToken(), agents: 'off', dangerous: false, bind: '' };
  }
  return remoteCfg;
}

const bindable = (addr: string) => addr === '' || addr === LOCAL_ONLY || lanAddresses().includes(addr);

async function saveRemoteConfig(cfg: RemoteConfig) {
  remoteCfg = cfg;
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(remoteFile(), JSON.stringify(cfg), { mode: 0o600 });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

function remoteInfo() {
  const cfg = remoteCfg;
  return {
    enabled: !!cfg?.enabled,
    running: !!remoteServer,
    port: cfg?.port ?? 47811,
    token: cfg?.token ?? '',
    addresses: lanAddresses(),
    error: remoteError,
    agents: cfg?.agents ?? 'off',
    dangerous: !!cfg?.dangerous,
    bind: cfg?.bind ?? '',
  };
}

/** Ask the renderer to handle a phone call and wait for its answer. */
function callRenderer(kind: string, payload: unknown): Promise<unknown> {
  if (!win || win.isDestroyed()) return Promise.reject(new RemoteCallError('The GUPPI window is closed on the PC.', 'not_connected'));
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    // Game requests can wait behind rate limits; give them time, then report
    // an unconfirmed outcome rather than letting the phone guess.
    const timer = setTimeout(() => {
      pendingRemote.delete(id);
      reject(new RemoteCallError('GUPPI on the PC did not answer in time. Check the game before repeating an order.', 'timeout'));
    }, 180_000);
    pendingRemote.set(id, { resolve, reject, timer });
    win!.webContents.send('remote:call', { id, kind, payload });
  });
}

function settleRemote(id: string, result: unknown) {
  const p = pendingRemote.get(id);
  if (!p) return;
  pendingRemote.delete(id);
  clearTimeout(p.timer);
  const r = (result ?? {}) as { ok?: boolean; value?: unknown; error?: string; code?: string };
  if (r.ok) p.resolve(r.value);
  else p.reject(new RemoteCallError(r.error ?? 'Remote call failed.', r.code));
}

async function applyRemote(cfg: RemoteConfig) {
  if (remoteServer) {
    await remoteServer.close();
    remoteServer = null;
  }
  remoteError = null;
  if (!cfg.enabled) return;
  const server = createRemoteServer({
    token: () => remoteCfg?.token ?? '',
    staticRoot: path.join(app.getAppPath(), 'renderer'),
    call: callRenderer,
    agent: { scope: () => remoteCfg?.agents ?? 'off', allowDangerous: () => !!remoteCfg?.dangerous, events: agentEvents },
  });
  try {
    await server.listen(cfg.port, cfg.bind || '0.0.0.0');
    remoteServer = server;
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? e.code : undefined;
    remoteError =
      code === 'EADDRINUSE'
        ? `Port ${cfg.port} is already in use. Choose another port.`
        : code === 'EADDRNOTAVAIL'
          ? `${cfg.bind} is not one of this PC's addresses right now. Choose another address to listen on.`
          : `Could not start: ${String(e)}`;
  }
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
  ipcMain.handle('app:check-update', guard(() => checkForUpdates()));

  // ── Phone remote ──
  ipcMain.handle('remote:reply', guard((id: unknown, result: unknown) => typeof id === 'string' && settleRemote(id, result)));
  ipcMain.handle('remote:get', guard(() => remoteInfo()));
  ipcMain.handle('remote:event', guard((event: unknown) => {
    if (event && typeof event === 'object' && typeof (event as { type?: unknown }).type === 'string') agentEvents.push(event as Record<string, unknown>);
  }));
  ipcMain.handle(
    'remote:set',
    guard(async (patch: unknown) => {
      const p = (patch ?? {}) as { enabled?: unknown; port?: unknown; regenerate?: unknown; agents?: unknown; dangerous?: unknown; bind?: unknown };
      const cfg = await loadRemoteConfig();
      if (typeof p.enabled === 'boolean') cfg.enabled = p.enabled;
      if (SCOPES.includes(p.agents as AgentScope)) cfg.agents = p.agents as AgentScope;
      if (typeof p.dangerous === 'boolean') cfg.dangerous = p.dangerous;
      if (typeof p.bind === 'string' && bindable(p.bind)) cfg.bind = p.bind;
      if (typeof p.port === 'number' && Number.isInteger(p.port) && p.port >= 1024 && p.port <= 65535) cfg.port = p.port;
      if (p.regenerate === true) cfg.token = newToken();
      await saveRemoteConfig(cfg);
      await applyRemote(cfg);
      return remoteInfo();
    }),
  );
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
          { label: 'Check for updates…', click: () => void showUpdateDialog() },
          { label: 'Report a problem', click: () => openExternal('https://github.com/Izzo2thePoint/GUPPI/issues/new/choose') },
          { type: 'separator' },
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
    backgroundColor: '#0b0f14',
    title: 'GUPPI',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#080b10', symbolColor: '#c3cad6', height: 55 },
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
    await applyRemote(await loadRemoteConfig());
    app.on('activate', () => !BrowserWindow.getAllWindows().length && void createWindow());
  });
  app.on('window-all-closed', () => {
    gateway.clearKey();
    if (process.platform !== 'darwin') app.quit();
  });
}
