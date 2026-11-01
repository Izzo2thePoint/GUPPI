import { describe, expect, it } from 'vitest';
import { Scheduler } from '../src/core/scheduler';
import { createSimulator } from '../src/core/simulator/world';
import { createGame } from '../src/core/game';
import { useJobs } from '../src/state/jobs';
import { craftTiming, matches, miningTiming, printerIdle, readPath, startCraftQueue, startMiningRun, startRoutine, validateRoutine, type Routine } from '../src/state/automations';
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

describe('crew allocation', () => {
  // 50× speed: a 0.05 ECE load takes 30 s of game time, so 600 ms here; a steel bar 400 ms.
  const fast = () => createGame(new Scheduler(createSimulator({ speed: 50, limit: 100_000 }), { spacingMs: 0 }));
  const quick = () => {
    miningTiming.waitMs = 20;
    miningTiming.afterLoadMs = 5;
    craftTiming.pollMs = 20;
  };
  // Both home asteroids are shared claims, so several runs may mine the same rock at once.
  const mine = (g: ReturnType<typeof fast>, mannyIds: string[], total: number, objectId = 'rock-home-1') =>
    startMiningRun(g, '1', { mannyIds, objectId, objectName: objectId, resources: [objectId === 'rock-home-2' ? 'carbon_compounds' : 'metals'], total, stopWhenFreeBelow: 0 });
  const firstWorker = (job: { assignments: { mannyId: string }[] }) => job.assignments[0]?.mannyId;

  it('starts a mining run with the free Mannies and pulls the busy ones in as their jobs release them', async () => {
    quick();
    const g = fast();
    // Guppy and Mario mine two loads for job A; Luigi mines two for job B (about 1.2 s each); only Hal is free.
    const a = mine(g, ['m-1a', 'm-1b'], 0.1);
    const b = mine(g, ['m-1c'], 0.1, 'rock-home-2');
    await until(() => a.assignments.length === 2 && b.assignments.length === 1);
    // Job C wants all four. It must start now with Hal, not wait for A and B.
    const c = mine(g, ['m-1a', 'm-1b', 'm-1c', 'm-1d'], 0.3, 'rock-home-2');
    await until(() => c.assignments.length >= 1);
    expect(firstWorker(c)).toBe('m-1d');
    expect(c.state).toBe('running');
    expect(a.finishedAt).toBeUndefined();
    // While it waits for the others, it says which job has each of them.
    await until(() => /waiting for: .*Guppy \(Mine rock-home-1/.test(c.message), 3000);
    expect(c.message).toMatch(/Luigi \(Mine rock-home-2/);
    await until(() => !!a.finishedAt && !!b.finishedAt && !!c.finishedAt, 20_000);
    expect([a.state, b.state, c.state]).toEqual(['done', 'done', 'done']);
    expect(c.message).toMatch(/^6 loads mined/);
    // Hal alone would need 3.6 s for six loads, so the Mannies freed by A and B must have joined in.
    const workers = new Set(c.assignments.map((x) => x.mannyId));
    expect(workers.has('m-1d')).toBe(true);
    expect(['m-1a', 'm-1b', 'm-1c'].some((id) => workers.has(id))).toBe(true);
    // No Manny was ever ordered for C while it still worked for A or B.
    const aEnd = Math.max(...a.assignments.map((x) => x.at));
    const bEnd = Math.max(...b.assignments.map((x) => x.at));
    expect(c.assignments.filter((x) => x.mannyId === 'm-1a' || x.mannyId === 'm-1b').every((x) => x.at > aEnd)).toBe(true);
    expect(c.assignments.filter((x) => x.mannyId === 'm-1c').every((x) => x.at > bEnd)).toBe(true);
  }, 30_000);

  it('hands a contested Manny to jobs in the order they were started', async () => {
    quick();
    const g = fast();
    const a = mine(g, ['m-1a'], 0.05);
    await until(() => a.assignments.length === 1);
    const b = mine(g, ['m-1a'], 0.05, 'rock-home-2');
    const c = mine(g, ['m-1a'], 0.05);
    await until(() => !!a.finishedAt && !!b.finishedAt && !!c.finishedAt, 20_000);
    expect([a.state, b.state, c.state]).toEqual(['done', 'done', 'done']);
    expect(b.assignments[0].at).toBeLessThan(c.assignments[0].at);
    expect(c.assignments[0].at).toBeGreaterThan(b.finishedAt! - 50);
  }, 30_000);

  it('a craft queue limited to a busy crew waits, says who it is waiting for, and takes the first Manny freed', async () => {
    quick();
    const g = fast();
    // Guppy mines three loads for A (about 1.8 s); Mario mines two for B (about 1.2 s).
    const a = mine(g, ['m-1a'], 0.15);
    const b = mine(g, ['m-1b'], 0.1, 'rock-home-2');
    await until(() => a.assignments.length === 1 && b.assignments.length === 1);
    const q = startCraftQueue(g, '1', { recipeId: 'steel_bar', recipeName: 'Steel bar', count: 1, printer: false, mannyIds: ['m-1a', 'm-1b'], waitForCompletion: true });
    // Nothing free: the queue waits and names the jobs holding its crew.
    await until(() => /Guppy \(Mine rock-home-1.*Mario \(Mine rock-home-2/.test(q.message), 5000);
    expect(q.assignments).toHaveLength(0);
    // Mario is freed first (B finishes), so the queue takes him while Guppy is still mining for A.
    await until(() => q.assignments.length === 1, 5000);
    expect(firstWorker(q)).toBe('m-1b');
    await until(() => !!a.finishedAt && !!b.finishedAt && !!q.finishedAt, 20_000);
    expect([a.state, b.state, q.state]).toEqual(['done', 'done', 'done']);
    expect(q.assignments[0].at).toBeGreaterThanOrEqual(b.finishedAt! - 5);
    expect(q.assignments[0].at).toBeLessThan(a.finishedAt!);
  }, 30_000);
});
