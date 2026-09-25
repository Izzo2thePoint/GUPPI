import { describe, expect, it } from 'vitest';
import { Scheduler, retryAfterMs, resetMs } from '../src/core/scheduler';
import { GameApiError, UncertainOutcomeError } from '../src/core/errors';
import { TransportFailure, type Transport, type WireRequest, type WireResponse } from '../src/core/transport';
import { createSimulator } from '../src/core/simulator/world';
import { createGame } from '../src/core/game';

const headers = { retryAfter: null, remaining: null, reset: null, limit: null };

function fake(handler: (r: WireRequest, n: number) => WireResponse | Promise<WireResponse>) {
  const calls: WireRequest[] = [];
  const transport: Transport = {
    kind: 'simulator',
    async send(r) {
      calls.push(r);
      return handler(r, calls.length);
    },
  };
  return { transport, calls };
}

const fast = { spacingMs: 0 };

describe('scheduler', () => {
  it('shares one request between identical queued reads', async () => {
    const { transport, calls } = fake(() => ({ status: 200, data: { probes: [] }, headers }));
    const s = new Scheduler(transport, fast);
    const a = s.request({ operation: 'GET /api/probes' });
    const b = s.request({ operation: 'GET /api/probes' });
    await Promise.all([a, b]);
    expect(calls).toHaveLength(1);
  });

  it('serves user requests before queued background work', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { transport, calls } = fake(async (_r, n) => {
      if (n === 1) await gate;
      return { status: 200, data: {}, headers };
    });
    const s = new Scheduler(transport, fast);
    const first = s.request({ operation: 'GET /api/version' });
    const bg = s.request({ operation: 'GET /api/probes' }, { priority: 'background' });
    const user = s.request({ operation: 'GET /api/crafting-recipes' }, { priority: 'user' });
    release();
    await Promise.all([first, bg, user]);
    expect(calls.map((c) => c.path)).toEqual(['/api/version', '/api/crafting-recipes', '/api/probes']);
  });

  it('waits and retries after 429 — including for mutations', async () => {
    const { transport, calls } = fake((_r, n) =>
      n === 1 ? { status: 429, data: {}, headers: { ...headers, retryAfter: '0.01' } } : { status: 202, data: { ok: true }, headers },
    );
    const s = new Scheduler(transport, fast);
    const r = await s.request({ operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/recall', params: { probeId: '1', mannyId: 'a' } });
    expect(r).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('never retries a mutation whose outcome is unknown', async () => {
    const { transport, calls } = fake(() => {
      throw new TransportFailure('socket hang up');
    });
    const s = new Scheduler(transport, fast);
    await expect(
      s.request({ operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/recall', params: { probeId: '1', mannyId: 'a' } }),
    ).rejects.toBeInstanceOf(UncertainOutcomeError);
    expect(calls).toHaveLength(1);
  });

  it('retries reads on network failure', async () => {
    const { transport, calls } = fake((_r, n) => {
      if (n === 1) throw new TransportFailure('reset');
      return { status: 200, data: { v: 1 }, headers };
    });
    const s = new Scheduler(transport, { spacingMs: 0 });
    // Backoff for the first retry is 1–2 s; keep the test fast by nudging.
    const p = s.request({ operation: 'GET /api/version' });
    setTimeout(() => s.nudge(), 20);
    await expect(p).resolves.toEqual({ v: 1 });
    expect(calls).toHaveLength(2);
  });

  it('surfaces game errors with their code and message', async () => {
    const { transport } = fake(() => ({ status: 409, data: { error: { code: 'manny_busy', message: 'Busy' } }, headers }));
    const s = new Scheduler(transport, fast);
    const e = (await s.request({ operation: "GET /api/version" }).catch((x) => x)) as GameApiError;
    expect(e).toBeInstanceOf(GameApiError);
    expect(e.code).toBe('manny_busy');
    expect(e.message).toBe('Busy');
  });

  it('rejects invalid commands synchronously without sending', async () => {
    const { transport, calls } = fake(() => ({ status: 200, data: {}, headers }));
    const s = new Scheduler(transport, fast);
    expect(() => s.request({ operation: 'GET /api/nope' })).toThrow();
    expect(calls).toHaveLength(0);
  });

  it('drops cancelled queued work', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { transport, calls } = fake(async (_r, n) => {
      if (n === 1) await gate;
      return { status: 200, data: {}, headers };
    });
    const s = new Scheduler(transport, fast);
    const first = s.request({ operation: 'GET /api/version' });
    const c = new AbortController();
    const cancelled = s.request({ operation: 'GET /api/probes' }, { signal: c.signal });
    c.abort();
    release();
    await first;
    await expect(cancelled).rejects.toThrow('Stopped');
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(1);
  });

  it('parses rate-limit headers', () => {
    expect(retryAfterMs('5')).toBe(5000);
    expect(retryAfterMs(null)).toBe(30_000);
    expect(resetMs('10')).toBe(10_000);
    expect(resetMs(String(Math.floor(Date.now() / 1000) + 20))).toBeGreaterThan(15_000);
  });
});

describe('simulator end-to-end', () => {
  it('runs a craft through the typed client', async () => {
    let t = Date.now();
    const s = new Scheduler(createSimulator({ now: () => t }), fast);
    const game = createGame(s);
    const probes = await game.probes();
    expect(probes.length).toBe(4);
    const crew = await game.mannies('1');
    const before = (await game.probe('1')).inventory!.items.filter((i) => i.type === 'steel_bar').length;
    await game.mannyAction('1', crew[0].id, 'craft', { recipe: 'steel_bar' });
    expect((await game.mannies('1'))[0].currentTask).toBe('crafting');
    t += 60_000;
    expect((await game.mannies('1'))[0].currentTask).toBeNull();
    const after = (await game.probe('1')).inventory!.items.filter((i) => i.type === 'steel_bar').length;
    expect(after).toBe(before + 1);
  });

  it('rejects conflicting orders for a busy Manny', async () => {
    const s = new Scheduler(createSimulator(), fast);
    const game = createGame(s);
    const [m] = await game.mannies('1');
    await game.mannyAction('1', m.id, 'craft', { recipe: 'steel_bar' });
    await expect(game.mannyAction('1', m.id, 'craft', { recipe: 'steel_bar' })).rejects.toMatchObject({ status: 409 });
  });
});
