import { describe, expect, it } from 'vitest';
import { Scheduler } from '../src/core/scheduler';
import { createSimulator } from '../src/core/simulator/world';
import { createGame } from '../src/core/game';
import { miningTargets, normSector, hasRefuelStation, scutRelays } from '../src/core/models';
import { outpostTiming, setupOutpost, sharedScut } from '../src/state/outpost-runner';
import { useOutposts } from '../src/state/outposts';
import { miningTiming, startMiningRun } from '../src/state/automations';
import { useJobs } from '../src/state/jobs';

(globalThis as { localStorage?: unknown }).localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
Object.assign(outpostTiming, { waitMs: 20, afterLoadMs: 5, idlePollMs: 10 });
Object.assign(miningTiming, { waitMs: 20, afterLoadMs: 5 });

const until = async (fn: () => boolean | Promise<boolean>, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 15));
  }
};

describe('sector parsing (game shapes)', () => {
  const s = normSector({
    dataFreshness: 'live',
    scutCoverageStatus: 'covered',
    scutNetworks: [{ id: 3, name: 'Net' }],
    objects: [
      {
        id: 'sys',
        type: 'solar_system',
        name: 'Sol',
        minableTargets: [
          { id: 'jup', type: 'planet', name: 'Jupiter', resourceTypes: ['deuterium'], resourceAmounts: { deuterium: 9 } },
          { id: 'dry', type: 'planet', name: 'Dry', resourceTypes: ['metals'], resourceAmounts: { metals: 0 } },
        ],
        bookmarkTargets: [{ id: 'jup', type: 'planet', name: 'Jupiter' }],
      },
      { id: 'rock', type: 'asteroid', mannyMineable: true, resourceTypes: ['ice'] },
      { id: 'far', type: 'asteroid', mannyMineable: true, estimated: true, resourceTypes: ['ice'] },
      { id: 9, type: 'scut_relay', name: 'Relay', status: 'inactive' },
      { id: 'st', type: 'deuterium_refuel_station', name: 'Depot' },
    ],
  })!;

  it('reads planets nested in minableTargets without duplicates', () => {
    expect(s.objects[0].children.map((c) => c.id)).toEqual(['jup', 'dry']);
    expect(s.scutNetworks).toEqual([{ id: '3', name: 'Net' }]);
  });

  it('lists mineable bodies like the game allows', () => {
    const t = miningTargets(s);
    expect(t.map((x) => x.id).sort()).toEqual(['jup', 'rock']);
    expect(t.find((x) => x.id === 'jup')!.parent).toBe('Sol');
  });

  it('finds relays and refuel stations', () => {
    expect(scutRelays(s).map((r) => r.id)).toEqual(['9']);
    expect(hasRefuelStation(s)).toBe(true);
  });

  it('requires live coverage on a common network for remote orders', () => {
    const other = normSector({ dataFreshness: 'live', scutCoverageStatus: 'covered', scutNetworks: [{ id: 3 }], objects: [] })!;
    const none = normSector({ dataFreshness: 'live', scutCoverageStatus: 'none', scutNetworks: [], objects: [] })!;
    expect(sharedScut(s, other)).toBe(true);
    expect(sharedScut(s, none)).toBe(false);
  });
});

describe('mining and outposts (simulator)', () => {
  it('refuels by mining deuterium into the tank in 0.05 ECE loads', async () => {
    const game = createGame(new Scheduler(createSimulator({ speed: 2000 }), { spacingMs: 0 }));
    const before = (await game.probe('1')).deuterium!;
    const job = startMiningRun(game, '1', { mannyIds: ['m-1c'], objectId: 'planet-home-b', objectName: 'Eridani b', resources: ['deuterium'], total: 0.1, stopWhenFreeBelow: 0 });
    await until(() => !!job.finishedAt);
    expect(job.state).toBe('done');
    expect((await game.probe('1')).deuterium!).toBeCloseTo(Math.min(100, before + 10), 1);
    expect(job.log.filter((l) => /load \d+ accepted/.test(l.text))).toHaveLength(2);
  });

  it('sets up an outpost and keeps mining remotely after the probe leaves', async () => {
    const game = createGame(new Scheduler(createSimulator({ speed: 2000 }), { spacingMs: 0 }));
    setupOutpost(game, {
      probeId: '1',
      name: 'Ceres camp',
      targetId: 'rock-home-1',
      targetName: 'Ceres-7',
      resource: 'metals',
      mannyIds: ['m-1a', 'm-1b'],
      total: 0.4,
      detachContainerId: 'cargo-1b',
    });
    const outpost = () => useOutposts.getState().outposts.find((o) => o.name === 'Ceres camp');
    await until(() => (outpost()?.loads ?? 0) >= 2);
    // Fly to a neighbouring sector that is still inside the SCUT network.
    await until(async () => {
      try {
        await game.move('1', { x: 1, y: 1, z: 0 });
        return true;
      } catch {
        return false;
      }
    });
    await until(() => outpost()?.status === 'complete', 30_000);
    const o = outpost()!;
    expect(o.mined).toBeCloseTo(0.4, 6);
    expect((await game.probe('1')).sector).toEqual({ x: 1, y: 1, z: 0 });
    const job = useJobs.getState().jobs.find((j) => j.kind === `outpost:${o.id}`)!;
    expect(job.log.some((l) => l.text.includes('(remote)'))).toBe(true);
    const home = await game.observeSector({ x: 0, y: 0, z: 0 });
    const box = home!.objects.find((x) => x.type === 'detached_container')!;
    expect(box.raw.usedCapacity).toBeCloseTo(0.4, 6);
    expect(box.raw.targetObjectId).toBe('rock-home-1');
  }, 40_000);
});
