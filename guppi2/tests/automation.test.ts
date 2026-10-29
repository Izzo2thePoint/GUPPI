import { describe, expect, it } from 'vitest';
import { Scheduler } from '../src/core/scheduler';
import { createSimulator } from '../src/core/simulator/world';
import { createGame } from '../src/core/game';
import { useJobs } from '../src/state/jobs';
import { craftTiming, matches, printerIdle, readPath, startCraftQueue, startRoutine, validateRoutine, type Routine } from '../src/state/automations';
import { ClaimConflict } from '../src/core/claims';

// jobs.ts and automations.ts touch localStorage through zustand persist; node has none.
(globalThis as { localStorage?: unknown }).localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

const until = async (fn: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const game = () => createGame(new Scheduler(createSimulator(), { spacingMs: 0 }));

describe('automations', () => {
  it('reads nested response paths and compares JSON values', () => {
    const data = { mannies: [{ currentTask: null, n: 2 }] };
    expect(readPath(data, 'mannies.0.n')).toBe(2);
    expect(matches(data, 'mannies.0.currentTask', 'null')).toBe(true);
    expect(matches(data, 'mannies.0.n', '3')).toBe(false);
  });

  it('validates routines before running', () => {
    const r: Routine = { id: 'r', name: 'x', steps: [], cycles: 1, interval: 0, updatedAt: 0 };
    expect(() => validateRoutine(r, '1')).toThrow(/at least one step/);
    r.steps = [{ id: 's', kind: 'until', command: { operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/recall', params: { mannyId: 'a' } }, field: 'x', expected: '1', every: 10, timeout: 60 }];
    expect(() => validateRoutine(r, '1')).toThrow(/GET/);
  });

  it('dry-runs a routine without sending orders', async () => {
    const g = game();
    const r: Routine = {
      id: 'r',
      name: 'Craft twice',
      cycles: 2,
      interval: 0,
      updatedAt: 0,
      steps: [{ id: 'a', kind: 'command', command: { operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/craft', params: { mannyId: 'm-1a' }, body: { recipe: 'steel_bar' } } }],
    };
    const job = startRoutine(g, '1', r, true);
    await until(() => !!job.finishedAt);
    expect(job.state).toBe('done');
    expect((await g.mannies('1')).every((m) => m.currentTask === null)).toBe(true);
  });

  it('spreads a craft queue across idle Mannies', async () => {
    const g = game();
    const job = startCraftQueue(g, '1', { recipeId: 'steel_bar', recipeName: 'Steel bar', count: 3, printer: false, waitForCompletion: false });
    await until(() => !!job.finishedAt);
    expect(job.state).toBe('done');
    const crafting = (await g.mannies('1')).filter((m) => m.currentTask === 'crafting');
    expect(crafting).toHaveLength(3);
  });

  it('queues printer crafts until the atomic printer is free instead of failing', async () => {
    craftTiming.pollMs = 20;
    // 50× speed: a 20 s print lasts 400 ms, so the next order meets a still-busy printer.
    const g = createGame(new Scheduler(createSimulator({ speed: 50 }), { spacingMs: 0 }));
    const before = (await g.probe('1')).inventory!.items.filter((i) => i.type === 'micro_conductor').length;
    const a = startCraftQueue(g, '1', { recipeId: 'micro_conductor', recipeName: 'Micro conductor', count: 3, printer: true, waitForCompletion: true });
    const b = startCraftQueue(g, '1', { recipeId: 'micro_conductor', recipeName: 'Micro conductor', count: 2, printer: true, waitForCompletion: true });
    await until(() => !!a.finishedAt && !!b.finishedAt, 25_000);
    expect([a.state, a.message]).toEqual(['done', '3 × Micro conductor crafted']);
    expect([b.state, b.message]).toEqual(['done', '2 × Micro conductor crafted']);
    const after = (await g.probe('1')).inventory!.items.filter((i) => i.type === 'micro_conductor').length;
    expect(after - before).toBe(5);
    expect(await printerIdle(g, '1', new AbortController().signal)).toBe(true);
  }, 30_000);

  it('refuses a second exclusive job on the same probe', () => {
    const jobs = useJobs.getState();
    const a = jobs.start({ name: 'Hold probe', kind: 't', probeId: '9', claims: [{ key: 'probe' }], run: (ctx) => ctx.sleep(10_000) });
    expect(() => jobs.start({ name: 'Other', kind: 't', probeId: '9', claims: [{ key: 'manny:x' }], exclusive: true, run: async () => undefined })).toThrow(ClaimConflict);
    a.controller.abort();
  });
});

describe('voyages', () => {
  it('flies a far destination as a series of one-sector jumps by default, and longer ones when allowed', async () => {
    const { startVoyage, voyageTiming } = await import('../src/state/automations');
    Object.assign(voyageTiming, { crewPollMs: 20, arrivalPollMs: 20 });
    const run = async (maxHop: number | undefined) => {
      const g = createGame(new Scheduler(createSimulator({ speed: 2000 }), { spacingMs: 0 }));
      const moves: { x: number; y: number; z: number }[] = [];
      const spy = { ...g, move: (id: string, t: { x: number; y: number; z: number }, o?: Parameters<typeof g.move>[2]) => (moves.push(t), g.move(id, t, o)) };
      const job = startVoyage(spy, '3', 'Bill', [{ x: 4, y: 1, z: 1 }], { scanOnArrival: false, minDeuterium: 0, maxHop }); // Bill starts at 1,1,2: 3 hops away
      await until(() => !!job.finishedAt, 20_000);
      expect([job.state, job.message]).toEqual(['done', 'Arrived at 4, 1, 1']);
      return moves;
    };
    const single = await run(undefined); // Settings default: one sector per jump
    expect(single).toHaveLength(3);
    expect(single.at(-1)).toEqual({ x: 4, y: 1, z: 1 });
    const far = await run(5);
    expect(far).toEqual([{ x: 4, y: 1, z: 1 }]);
  }, 30_000);
});
