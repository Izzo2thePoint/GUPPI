import { describe, expect, it } from 'vitest';
import { Gateway, isDocumented, redact, validateKey } from '../electron/gateway';

function mockFetch(respond: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('gateway', () => {
  it('only allows documented endpoints', () => {
    expect(isDocumented('GET', '/api/probe/12/mannies')).toBe(true);
    expect(isDocumented('POST', '/api/probe/12/mannies/abc-1/craft')).toBe(true);
    expect(isDocumented('GET', '/api/probe/12/secret')).toBe(false);
    expect(isDocumented('DELETE', '/api/probes')).toBe(false);
    expect(isDocumented('GET', '/api/sector?x=1&y=1&z=0')).toBe(true);
  });

  it('refuses requests before a key is set and for undocumented paths', async () => {
    const { fn, calls } = mockFetch(() => Response.json({}));
    const g = new Gateway(fn);
    expect(await g.request('1', { method: 'GET', path: '/api/probes' })).toMatchObject({ notSent: true });
    g.setKey('secret-key');
    expect(await g.request('2', { method: 'GET', path: '/api/../admin' })).toMatchObject({ notSent: true });
    expect(await g.request('3', { method: 'GET', path: 'https://evil.example/api/probes' })).toMatchObject({ notSent: true });
    expect(calls).toHaveLength(0);
  });

  it('sends to the fixed host with the key and redacts echoes of it', async () => {
    const { fn, calls } = mockFetch(() =>
      Response.json({ note: 'your key secret-key was used', secret: 1 }, { headers: { 'x-ratelimit-remaining': '41', 'retry-after': '3' } }),
    );
    const g = new Gateway(fn);
    g.setKey('secret-key');
    const r = await g.request('4', { method: 'GET', path: '/api/probes' });
    expect(calls[0].url).toBe('https://neumann-probe.net/api/probes');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
    expect(calls[0].init.redirect).toBe('manual');
    expect(r).toMatchObject({ status: 200, data: { note: 'your key [redacted] was used' }, headers: { remaining: '41', retryAfter: '3' } });
    expect(JSON.stringify(r)).not.toContain('secret-key');
  });

  it('reports network failures as possibly-sent', async () => {
    const { fn } = mockFetch(() => {
      throw new Error('ECONNRESET');
    });
    const g = new Gateway(fn);
    g.setKey('k');
    expect(await g.request('5', { method: 'POST', path: '/api/probe/1/mannies/a/recall' })).toEqual({ error: 'No response from the game.', notSent: false });
  });

  it('validates keys and redacts nested values', () => {
    expect(() => validateKey('')).toThrow();
    expect(() => validateKey('has space')).toThrow();
    expect(validateKey('  abc  ')).toBe('abc');
    expect(redact({ a: ['x-k-x'], k: 1 }, 'k')).toEqual({ a: ['x-[redacted]-x'], '[redacted]': 1 });
  });
});
