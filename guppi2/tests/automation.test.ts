import { describe, expect, it } from 'vitest';
import { Scheduler } from '../src/core/scheduler';
import { createSimulator } from '../src/core/simulator/world';
import { createGame } from '../src/core/game';
import { useJobs } from '../src/state/jobs';
import { matches, readPath, startCraftQueue, startRoutine, validateRoutine, type Routine } from '../src/state/automations';
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

  it('refuses a second exclusive job on the same probe', () => {
    const jobs = useJobs.getState();
    const a = jobs.start({ name: 'Hold probe', kind: 't', probeId: '9', claims: [{ key: 'probe' }], run: (ctx) => ctx.sleep(10_000) });
    expect(() => jobs.start({ name: 'Other', kind: 't', probeId: '9', claims: [{ key: 'manny:x' }], exclusive: true, run: async () => undefined })).toThrow(ClaimConflict);
    a.controller.abort();
  });
});
