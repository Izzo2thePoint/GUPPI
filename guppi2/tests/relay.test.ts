import { afterEach, describe, expect, it, vi } from 'vitest';
import relay from '../../relay/worker.js';

const upstream = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'X-RateLimit-Remaining': '42', 'Set-Cookie': 'x=1' } }));
vi.stubGlobal('fetch', upstream);
afterEach(() => upstream.mockClear());

const req = (path: string, init: RequestInit & { origin?: string } = {}) =>
  new Request(`https://relay.example${path}`, { ...init, headers: { Origin: init.origin ?? 'https://me.github.io', ...(init.headers as Record<string, string>) } });

describe('relay worker', () => {
  it('forwards game API calls to the fixed host with the caller’s key', async () => {
    const res = await relay.fetch(req('/api/probe/1/move', { method: 'POST', headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json', Cookie: 'no' }, body: '{"x":1}' }));
    expect(res.status).toBe(200);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe('https://neumann-probe.net/api/probe/1/move');
    expect(init?.redirect).toBe('manual');
    const sent = new Headers(init?.headers);
    expect(sent.get('authorization')).toBe('Bearer k');
    expect(sent.get('cookie')).toBeNull();
    expect(res.headers.get('access-control-allow-origin')).toBe('https://me.github.io');
    expect(res.headers.get('access-control-expose-headers')).toContain('X-RateLimit-Remaining');
    expect(res.headers.get('x-ratelimit-remaining')).toBe('42');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('answers CORS preflight without calling the game', async () => {
    const res = await relay.fetch(req('/api/probes', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('relays nothing but game API paths', async () => {
    for (const path of ['/admin', '/api/../admin', '/api/%2e%2e/admin', '/api/probe%2F1', '/api//probes', '/api/probe.json']) {
      expect((await relay.fetch(req(path))).status).toBeGreaterThanOrEqual(400);
    }
    expect((await relay.fetch(req('/api/probes', { method: 'PUT' }))).status).toBe(405);
    expect(upstream).not.toHaveBeenCalled();
    // Dot segments are resolved before the check, so they can never climb out of /api/.
    await relay.fetch(req('/api/probe/1/%2e%2e/2'));
    expect(upstream.mock.calls[0][0]).toBe('https://neumann-probe.net/api/probe/2');
  });

  it('tells GUPPI Mobile it can relay for its own site', async () => {
    const res = await relay.fetch(req('/relay-info'));
    expect(await res.json()).toEqual({ guppiRelay: 1 });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('honours ALLOWED_ORIGINS', async () => {
    const env = { ALLOWED_ORIGINS: 'https://me.github.io' };
    expect((await relay.fetch(req('/api/probes'), env)).status).toBe(200);
    expect((await relay.fetch(req('/api/probes', { origin: 'https://evil.example' }), env)).status).toBe(403);
    // GUPPI Mobile served by the relay itself: same-origin POSTs carry its own Origin, GETs carry none.
    expect((await relay.fetch(req('/api/probe/1/move', { method: 'POST', origin: 'https://relay.example', body: '{}' }), env)).status).toBe(200);
    expect((await relay.fetch(new Request('https://relay.example/api/probes'), env)).status).toBe(200);
  });

  it('does not follow redirects from upstream', async () => {
    upstream.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example' } }));
    expect((await relay.fetch(req('/api/probes'))).status).toBe(502);
  });
});
