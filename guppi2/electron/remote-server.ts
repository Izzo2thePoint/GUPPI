/**
 * Phone remote server. Opt-in, runs in the Electron main process, and serves
 * two things to devices on the player's network:
 *   GET  /…                 the GUPPI Mobile web app (static files only)
 *   *    /remote/v1/…       an authenticated API that forwards to the renderer
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

export function createRemoteServer(opts: { token: () => string; staticRoot: string; entry?: string; call: RemoteCall; log?: (line: string) => void }) {
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

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://remote.local');
    if (!url.pathname.startsWith('/remote/')) return serveStatic(req, res, url.pathname);

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
