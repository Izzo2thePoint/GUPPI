// Shared client for the guppi CLI and the MCP server: configuration, the HTTP
// call, and the verb table. Node 22+, no dependencies.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

export const VERBS = createRequire(import.meta.url)('./verbs.json');
export const VERSION = createRequire(import.meta.url)('./package.json').version;

export const DEFAULT_URL = 'http://127.0.0.1:47811';

/** Where the pairing is remembered: XDG config on Linux/macOS, %APPDATA% on Windows. */
export function configPath() {
  const base = process.platform === 'win32' ? (process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')) : (process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'));
  return path.join(base, 'guppi', 'cli.json');
}

export function loadConfig() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    /* not paired yet */
  }
  return {
    url: process.env.GUPPI_URL ?? saved.url ?? DEFAULT_URL,
    token: process.env.GUPPI_TOKEN ?? saved.token ?? '',
    client: process.env.GUPPI_CLIENT ?? saved.client ?? 'guppi-cli',
  };
}

export function saveConfig(cfg) {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  return file;
}

/** Accepts a pairing link (http://pc:47811/#pair=TOKEN), a bare token, or url + token. */
export function parsePairing(input, url) {
  const m = String(input ?? '').match(/^(https?:\/\/[^/#?]+)[^#]*#pair=([A-Za-z0-9_-]{16,})$/);
  if (m) return { url: m[1], token: m[2] };
  if (/^[A-Za-z0-9_-]{16,}$/.test(String(input ?? ''))) return { url: url ?? DEFAULT_URL, token: String(input) };
  throw new Error('Give the pairing link from GUPPI (Settings → Phone & agent access → Copy pairing link) or a token.');
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
}

/** One call to the Agent API. Returns the parsed JSON body; throws ApiError on non-2xx. */
export async function call(cfg, method, apiPath, { body, query } = {}) {
  if (!cfg.token) throw new Error('Not paired. Run: guppi pair <pairing link>   (from GUPPI → Settings → Phone & agent access)');
  const url = new URL(apiPath, cfg.url.endsWith('/') ? cfg.url : cfg.url + '/');
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, 'X-GUPPI-Client': cfg.client, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(`Cannot reach GUPPI at ${cfg.url}: ${e.cause?.code ?? e.message}. Is GUPPI running with remote access on?`);
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Follow the event stream; `onEvent` gets each event object. Resolves when the stream ends. */
export async function stream(cfg, since, onEvent, signal) {
  const url = new URL('/api/v1/events', cfg.url);
  if (since !== undefined) url.searchParams.set('since', String(since));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}`, 'X-GUPPI-Client': cfg.client, Accept: 'text/event-stream' }, signal });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('\n');
      if (data) {
        try {
          onEvent(JSON.parse(data));
        } catch {
          /* ignore malformed */
        }
      }
    }
  }
}

/** Reads and actions as a flat list of tool definitions (used by the MCP server and `guppi help`). */
export function tools() {
  const reads = VERBS.reads
    .filter((r) => r.name !== 'openapi')
    .map((r) => {
      const pathParams = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const properties = {};
      for (const p of pathParams) properties[p] = { type: 'string' };
      for (const q of r.query ?? []) properties[q] = { type: 'string' };
      return { name: `guppi_${r.name}`, kind: 'read', verb: r, description: r.description, inputSchema: { type: 'object', properties, required: pathParams } };
    });
  const actions = VERBS.actions.map((a) => ({ name: `guppi_${a.name.replace(/-/g, '_')}`, kind: 'action', verb: a, description: a.description + (a.dangerous ? ' DANGEROUS: needs "Allow dangerous actions" in GUPPI.' : ''), inputSchema: a.params }));
  const game = {
    name: 'guppi_game',
    kind: 'game',
    description: "Send any documented Neumann Probe API request through GUPPI (validated, rate-limited, never retried blindly). Prefer the specific tools; use this for endpoints they don't cover.",
    inputSchema: { type: 'object', required: ['method', 'path'], properties: { method: { type: 'string', enum: ['GET', 'POST', 'PATCH', 'DELETE'] }, path: { type: 'string', description: 'Game API path, e.g. /api/probe/1/sector' }, body: { type: 'object' } } },
  };
  return [...reads, ...actions, game];
}

/** Run a tool by name with arguments: shared by the MCP server and the CLI's generic path. */
export async function runTool(cfg, name, args = {}) {
  const t = tools().find((x) => x.name === name);
  if (!t) throw new Error(`Unknown tool ${name}`);
  if (t.kind === 'read') {
    let p = t.verb.path;
    const query = {};
    for (const [k, v] of Object.entries(args)) {
      if (p.includes(`{${k}}`)) p = p.replace(`{${k}}`, encodeURIComponent(String(v)));
      else query[k] = v;
    }
    if (/\{\w+\}/.test(p)) throw new Error(`Missing path parameter for ${name}: ${p}`);
    return call(cfg, 'GET', p, { query });
  }
  if (t.kind === 'action') return call(cfg, 'POST', `/api/v1/actions/${t.verb.name}`, { body: args });
  return call(cfg, 'POST', '/api/v1/game', { body: args });
}
