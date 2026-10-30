/**
 * Remote access server. Opt-in, runs in the Electron main process, and serves
 * three things to devices on the player's network:
 *   GET  /…                 the GUPPI Mobile web app (static files only)
 *   *    /remote/v1/…       the phone's API, forwarded to the renderer
 *   *    /api/v1/…          the Agent API for scripts, the guppi CLI and MCP
 *                           (same token; read or control scope; an event stream)
 *
 * Security:
 *  - every API call needs the pairing token (constant-time compare); it is
 *    delivered in the pairing link's #fragment, so it never appears in URLs
 *    sent to the server or in logs;
 *  - repeated bad tokens lock the caller out for a while;
 *  - game requests are re-validated against the documented API on the PC and
 *    run through the app's own scheduler — the game key never leaves the PC;
 *  - no CORS: only the app served from this origin can call the API.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

export type RemoteCall = (kind: string, payload: unknown) => Promise<unknown>;

export type AgentScope = 'off' | 'read' | 'control';
export type AgentEvent = { seq: number; at: number; type: string; [k: string]: unknown };
/** Recent events plus live subscribers, kept by the main process. */
export type EventHub = { since: (seq: number) => AgentEvent[]; latest: () => number; subscribe: (fn: (e: AgentEvent) => void) => () => void };
export type AgentOptions = { scope: () => AgentScope; allowDangerous: () => boolean; events: EventHub };

/** A small in-memory event hub: a ring of the last `keep` events and live listeners. */
export function createEventHub(keep = 200) {
  const events: AgentEvent[] = [];
  const listeners = new Set<(e: AgentEvent) => void>();
  let seq = 0;
  const hub: EventHub & { push: (e: Record<string, unknown>) => AgentEvent } = {
    push(e) {
      const ev: AgentEvent = { ...(e as { type: string }), seq: ++seq, at: Date.now() };
      events.push(ev);
      if (events.length > keep) events.splice(0, events.length - keep);
      for (const fn of listeners) fn(ev);
      return ev;
    },
    since: (n) => events.filter((e) => e.seq > n),
    latest: () => seq,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return hub;
}

export class RemoteCallError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const MAX_BODY = 64_000;
const LOCKOUT_FAILS = 10;
const LOCKOUT_MS = 10 * 60_000;

export function tokensMatch(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && b.length > 0 && timingSafeEqual(a, b);
}

export function createRemoteServer(opts: { token: () => string; staticRoot: string; entry?: string; call: RemoteCall; log?: (line: string) => void; agent?: AgentOptions }) {
  const failures = new Map<string, { count: number; since: number }>();
  const entry = opts.entry ?? 'mobile.html';

  const send = (res: http.ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) => {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
    res.end(json);
  };

  async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return send(res, 400, { error: 'Bad path' });
    }
    if (decoded.includes('\0') || decoded.includes('\\')) return send(res, 403, { error: 'Forbidden' });
    const root = path.resolve(opts.staticRoot);
    const rel = decoded === '/' || decoded === '/index.html' ? `/${entry}` : decoded;
    const target = path.resolve(root, '.' + rel);
    if (!target.startsWith(root + path.sep)) return send(res, 403, { error: 'Forbidden' });
    try {
      const body = await fs.readFile(target);
      const ext = path.extname(target);
      res.writeHead(200, {
        'Content-Type': TYPES[ext] ?? 'application/octet-stream',
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': ext === '.html' || ext === '.webmanifest' ? 'no-store' : 'public, max-age=86400',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      send(res, 404, { error: 'Not found' });
    }
  }

  function readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new RemoteCallError('Request too large', 'too_large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text.trim()) return resolve(undefined);
        try {
          resolve(JSON.parse(text));
        } catch {
          reject(new RemoteCallError('Invalid JSON', 'bad_json'));
        }
      });
      req.on('error', reject);
    });
  }

  /** `GET /api/v1/events`: a live SSE stream, or the recent events as JSON. */
  function serveEvents(req: http.IncomingMessage, res: http.ServerResponse, url: URL, hub: EventHub) {
    const since = Number(req.headers['last-event-id'] ?? url.searchParams.get('since') ?? NaN);
    const from = Number.isFinite(since) ? since : hub.latest();
    if (!(req.headers.accept ?? '').includes('text/event-stream')) return send(res, 200, { events: hub.since(Number.isFinite(since) ? since : 0), latest: hub.latest() });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const write = (e: AgentEvent) => res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    for (const e of hub.since(from)) write(e);
    const stop = hub.subscribe(write);
    const beat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      stop();
      clearInterval(beat);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://remote.local');
    const isAgent = url.pathname.startsWith('/api/v1/') || url.pathname === '/api/v1';
    if (!url.pathname.startsWith('/remote/') && !isAgent) return serveStatic(req, res, url.pathname);

    const ip = req.socket.remoteAddress ?? 'unknown';
    const f = failures.get(ip);
    if (f && f.count >= LOCKOUT_FAILS && Date.now() - f.since < LOCKOUT_MS) return send(res, 429, { error: 'Too many failed pairing attempts. Try again later.' }, { 'Retry-After': '600' });

    const auth = req.headers.authorization ?? '';
    const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!tokensMatch(given, opts.token())) {
      const prev = f && Date.now() - f.since < LOCKOUT_MS ? f : { count: 0, since: Date.now() };
      failures.set(ip, { count: prev.count + 1, since: prev.since });
      opts.log?.(`Rejected phone remote call from ${ip}`);
      return send(res, 401, { error: 'Not paired. Scan the pairing code in GUPPI on your PC.' });
    }
    failures.delete(ip);

    try {
      if (isAgent) {
        const agent = opts.agent;
        const scope = agent?.scope() ?? 'off';
        if (!agent || scope === 'off') return send(res, 403, { error: 'Agent access is off. In GUPPI, open Settings → Phone & agent access and set Agents to Read-only or Control.', code: 'agents_off' });
        if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Use GET for reads and POST for actions.', code: 'method_not_allowed' });
        if (req.method === 'POST' && scope !== 'control') return send(res, 403, { error: 'This token has read-only scope. In GUPPI, set Settings → Phone & agent access → Agents to Control.', code: 'read_only' });
        if (req.method === 'GET' && url.pathname === '/api/v1/events') return serveEvents(req, res, url, agent.events);
        const client = String(req.headers['x-guppi-client'] ?? 'agent');
        const host = req.headers.host ? `http://${req.headers.host}` : undefined;
        const out = (await opts.call('agent', {
          method: req.method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          body: req.method === 'POST' ? await readBody(req) : undefined,
          scope,
          allowDangerous: agent.allowDangerous(),
          client,
          serverUrl: host,
        })) as { status: number; body: unknown };
        return send(res, out.status, out.body);
      }
      if (req.method === 'GET' && url.pathname === '/remote/v1/hello') return send(res, 200, await opts.call('status', undefined));
      if (req.method === 'GET' && url.pathname === '/remote/v1/status') return send(res, 200, await opts.call('status', undefined));
      if (req.method === 'POST' && url.pathname === '/remote/v1/game') return send(res, 200, await opts.call('game', await readBody(req)));
      if (req.method === 'POST' && url.pathname === '/remote/v1/action') return send(res, 200, await opts.call('action', await readBody(req)));
      return send(res, 404, { error: 'Unknown remote endpoint' });
    } catch (e) {
      const code = e instanceof RemoteCallError ? e.code : undefined;
      const message = e instanceof Error ? e.message : String(e);
      if (code === 'not_connected') return send(res, 503, { error: message, code });
      if (code === 'too_large' || code === 'bad_json') return send(res, 400, { error: message, code });
      if (code === 'timeout') return send(res, 200, { error: message, uncertain: true });
      return send(res, 500, { error: message, code });
    }
  });

  return {
    server,
    listen: (port: number, host = '0.0.0.0') =>
      new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          const addr = server.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
