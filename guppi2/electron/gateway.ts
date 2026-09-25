/**
 * The only code that talks to the game. It runs in the main process, holds the
 * API key, and forwards validated requests to the fixed game host. The renderer
 * never sees the key and cannot reach any other host.
 */
import catalog from '../src/core/catalog.json';

export const GAME_ORIGIN = 'https://neumann-probe.net';
const METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);
const MAX_BODY = 64_000;
const TIMEOUT_MS = 30_000;

type CatalogEntry = { method: string; path: string };

/** One regex per documented operation: `/api/probe/{probeId}` → `^/api/probe/[A-Za-z0-9_-]{1,128}$`. */
const escape = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const ROUTES = (catalog as CatalogEntry[]).map((op) => ({
  method: op.method,
  re: new RegExp('^' + op.path.split(/\{[^}]+\}/).map(escape).join('[A-Za-z0-9_-]{1,128}') + '$'),
}));

export function isDocumented(method: string, path: string) {
  const bare = path.split('?')[0];
  return ROUTES.some((r) => r.method === method && r.re.test(bare));
}

export type WireRequest = { method: string; path: string; body?: unknown };
export type WireResult =
  | { status: number; data: unknown; headers: { retryAfter: string | null; remaining: string | null; reset: string | null; limit: string | null } }
  | { error: string; notSent: boolean };

export function redact(value: unknown, secret: string): unknown {
  if (!secret) return value;
  if (typeof value === 'string') return value.split(secret).join('[redacted]');
  if (Array.isArray(value)) return value.map((v) => redact(v, secret));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k.split(secret).join('[redacted]'), redact(v, secret)]));
  return value;
}

export function validateKey(key: unknown): string {
  if (typeof key !== 'string') throw new Error('Enter your personal API key.');
  const k = key.trim();
  if (!k) throw new Error('Enter your personal API key.');
  if (k.length > 4096 || /\s/.test(k)) throw new Error('That does not look like an API key.');
  return k;
}

export class Gateway {
  private key = '';
  private inflight = new Map<string, { controller: AbortController; read: boolean }>();

  constructor(private transport: typeof fetch = fetch) {}

  setKey(key: string) {
    this.key = validateKey(key);
  }
  clearKey() {
    this.key = '';
    for (const { controller, read } of this.inflight.values()) if (read) controller.abort();
  }
  get connected() {
    return !!this.key;
  }

  /** Only reads may be cancelled: a mutation that left GUPPI must be allowed to finish. */
  cancel(id: string) {
    const entry = this.inflight.get(id);
    if (entry?.read) entry.controller.abort();
  }

  async request(id: unknown, req: WireRequest): Promise<WireResult> {
    if (typeof id !== 'string' || id.length > 100) return { error: 'Invalid request id.', notSent: true };
    if (!this.key) return { error: 'Not connected.', notSent: true };
    if (!req || typeof req !== 'object' || !METHODS.has(req.method) || typeof req.path !== 'string') return { error: 'Invalid request.', notSent: true };
    if (!req.path.startsWith('/api/') || req.path.includes('..') || req.path.includes('//') || !isDocumented(req.method, req.path))
      return { error: 'Only documented game API endpoints can be called.', notSent: true };
    let body: string | undefined;
    if (req.body !== undefined) {
      body = JSON.stringify(req.body);
      if (body.length > MAX_BODY) return { error: 'Request body is too large.', notSent: true };
    }

    const controller = new AbortController();
    const read = req.method === 'GET';
    this.inflight.set(id, { controller, read });
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.transport(GAME_ORIGIN + req.path, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          Accept: 'application/json',
          'User-Agent': 'GUPPI/2.0',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
      const text = await response.text();
      let data: unknown = null;
      if (text.trim()) {
        try {
          data = JSON.parse(text.replace(/^﻿/, ''));
        } catch {
          return { error: `The game returned an unreadable response (HTTP ${response.status}).`, notSent: false };
        }
      }
      return {
        status: response.status,
        data: redact(data, this.key),
        headers: {
          retryAfter: response.headers.get('retry-after'),
          remaining: response.headers.get('x-ratelimit-remaining'),
          reset: response.headers.get('x-ratelimit-reset'),
          limit: response.headers.get('x-ratelimit-limit'),
        },
      };
    } catch {
      return { error: controller.signal.aborted ? 'The request timed out or was cancelled.' : 'No response from the game.', notSent: false };
    } finally {
      clearTimeout(timer);
      this.inflight.delete(id);
    }
  }
}
