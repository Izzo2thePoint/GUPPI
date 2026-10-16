/**
 * Runs mining outposts. Ported from GUPPI 1.16's remote mining, with the same
 * safety rules:
 *  - one load per Manny at a time, re-reading all telemetry before each order;
 *  - remote orders only while the probe is stationary and both sectors report
 *    live data under the same SCUT network;
 *  - Mannies out of contact (`unknown_too_far`) are waited for, never guessed;
 *  - a load is counted only when the game confirms it; an unconfirmed order
 *    stops the outpost so nothing is sent twice.
 */
import type { Game } from '@/core/game';
import { asteroids, detachedContainers, isMoving, mannyReady, type Manny, type Sector } from '@/core/models';
import { formatCoord, sameCoord } from '@/core/lattice';
import { GameApiError, UncertainOutcomeError, errorMessage, isStopped } from '@/core/errors';
import { queryClient } from './query';
import { keys } from './hooks';
import { useJobs, type JobContext } from './jobs';
import { departureHeld, splitAmount, useOutposts, type Outpost } from './outposts';
import { archiveSector } from './archive';

const A = (signal: AbortSignal) => ({ priority: 'automation' as const, signal });
const LIVE = ['live', 'degraded_live'];
/** Poll intervals (tests shorten them). */
export const outpostTiming = { waitMs: 20_000, afterLoadMs: 4000, idlePollMs: 10_000 };
const CARGO = 0.05;

export function sharedScut(a?: Sector, b?: Sector) {
  const live = (s?: Sector) => !!s && (!s.dataFreshness || LIVE.includes(s.dataFreshness)) && s.scutCoverage === 'covered';
  return live(a) && live(b) && a!.scutNetworks.some((n) => b!.scutNetworks.some((x) => x.id === n.id));
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** Conditions that clear by themselves (sensors offline in flight): wait, don't block the outpost. */
const transient = (e: unknown) => e instanceof GameApiError && (e.code === 'sensors_unavailable' || /moving|in transit|travell?ing/i.test(`${e.code} ${e.message}`));
const atOutpost = (m: Manny, o: Outpost) => m.locationType === 'sector' && sameCoord(m.locationSector, o.coord);
const minedHere = (m: Manny, o: Outpost) => m.currentTask === 'mining' && m.taskObjectId === o.targetId && (!m.taskContainerId || o.containerIds.includes(m.taskContainerId));

/** Is an outpost job already running for this outpost? */
export const outpostJob = (id: string) => useJobs.getState().jobs.find((j) => !j.finishedAt && j.kind === `outpost:${id}`);

export function startOutpost(game: Game, outpostId: string) {
  const existing = outpostJob(outpostId);
  if (existing) return existing;
  const store = useOutposts.getState();
  const initial = store.outposts.find((o) => o.id === outpostId);
  if (!initial) throw new Error('Outpost not found.');
  store.patch(outpostId, { active: true, status: 'running', message: 'Starting…' });
  return useJobs.getState().start({
    name: `Outpost: ${initial.name}`,
    kind: `outpost:${outpostId}`,
    probeId: initial.probeId,
    claims: initial.mannyIds.map((id) => ({ key: `manny:${id}` })),
    run: (ctx) => runOutpost(game, outpostId, ctx),
  });
}

export function pauseOutpost(outpostId: string) {
  useOutposts.getState().patch(outpostId, { active: false, status: 'paused', message: 'Paused. Loads already accepted by the game continue.' });
  outpostJob(outpostId)?.controller.abort();
}

async function runOutpost(game: Game, outpostId: string, ctx: JobContext): Promise<string> {
  const get = () => {
    const o = useOutposts.getState().outposts.find((x) => x.id === outpostId);
    if (!o) throw new Error('Outpost was deleted.');
    return o;
  };
  const set = (patch: Partial<Outpost>) => useOutposts.getState().patch(outpostId, patch);
  const wait = async (message: string) => {
    set({ status: 'waiting', message });
    ctx.report(message);
    await ctx.sleep(outpostTiming.waitMs);
  };
  const deadline = Date.now() + 7 * 86400_000;

  try {
    while (true) {
      ctx.check();
      if (Date.now() > deadline) throw new Error('This run reached its 7-day limit. Check the outpost, then resume.');
      const o = get();
      const probe = await game.probe(o.probeId, A(ctx.signal));
      const mannies = await game.mannies(o.probeId, A(ctx.signal));
      const crew = o.mannyIds.map((id) => mannies.find((m) => m.id === id));
      if (crew.some((m) => !m)) throw new Error('An assigned Manny is no longer on this probe.');
      const team = crew as Manny[];

      if (team.some((m) => m.currentTask === 'unknown_too_far')) {
        await wait('Out of SCUT contact with the outpost crew. Waiting — no orders are sent blind.');
        continue;
      }
      const working = team.filter((m) => m.currentTask !== null);
      const stray = working.find((m) => !minedHere(m, o) && !['returning', 'waiting_for_space'].includes(String(m.currentTask)));
      if (stray) throw new Error(`${stray.name} is doing something else (${String(stray.currentTask)}). Free it, then resume the outpost.`);

      if (o.mannyIds.every((id) => (o.remaining[id] ?? 0) <= 1e-6)) {
        if (working.length) {
          await wait('All loads ordered. Waiting for the last accepted loads to finish.');
          continue;
        }
        set({ status: 'complete', active: false, message: `Done: ${o.loads} loads, ${+o.mined.toFixed(4)} ECE of ${o.resource.replaceAll('_', ' ')}. Recover the container to bring it home.` });
        return `Outpost ${o.name} complete`;
      }

      // A Manny that left with the probe can't reach the asteroid: hand its share to the crew still there.
      if (!sameCoord(probe.sector, o.coord) && !isMoving(probe)) {
        const gone = team.filter((m) => m.locationType === 'probe' && (o.remaining[m.id] ?? 0) > 1e-6);
        const stationed = team.filter((m) => atOutpost(m, o));
        if (gone.length && stationed.length) {
          const moved = gone.reduce((n, m) => n + (o.remaining[m.id] ?? 0), 0);
          const share = splitAmount(moved, stationed.map((m) => m.id));
          const remaining = { ...o.remaining };
          for (const m of gone) remaining[m.id] = 0;
          for (const m of stationed) remaining[m.id] = round6((remaining[m.id] ?? 0) + share[m.id]);
          set({ remaining });
          ctx.log(`${gone.map((m) => m.name).join(', ')} left with the probe; ${+moved.toFixed(4)} ECE moves to ${stationed.map((m) => m.name).join(', ')}`, 'warn');
          continue;
        }
        if (gone.length && !stationed.length) throw new Error('No crew is stationed at the outpost. Come back and let the Mannies deploy before leaving.');
      }
      // Deploy Mannies that are still aboard first, so the whole crew is out before you leave.
      const idle = team.filter((m) => m.currentTask === null && m.canReceiveOrders && (o.remaining[m.id] ?? 0) > 1e-6);
      // The probe is about to leave: only send the first load that deploys a Manny still aboard,
      // and let everyone else finish and stand at the asteroid so they stay behind.
      const holding = departureHeld(o.probeId) && sameCoord(probe.sector, o.coord) && !isMoving(probe);
      const next = holding ? idle.find((m) => m.locationType === 'probe') : (idle.find((m) => m.locationType === 'probe') ?? idle[0]);
      if (!next) {
        if (holding) {
          set({ status: 'waiting', message: 'Holding new loads while the probe prepares to leave. The crew stays at the asteroid.' });
          ctx.report('Holding loads for departure');
          await ctx.sleep(outpostTiming.afterLoadMs);
          continue;
        }
        await wait(`${working.length} Manny${working.length === 1 ? '' : 's'} mining. Waiting for the next free miner.`);
        continue;
      }
      if (isMoving(probe) || !probe.sector) {
        await wait('Probe is travelling. Orders resume at the next stationary stop with SCUT contact.');
        continue;
      }

      const remote = !sameCoord(probe.sector, o.coord);
      let observation: Sector | undefined;
      try {
        observation = remote ? await game.observeSector(o.coord, A(ctx.signal)) : (await game.sector(o.probeId, A(ctx.signal))).sector;
        archiveSector(observation, o.coord);
      } catch (e) {
        // The probe started moving between readings: sensors come back when it stops.
        if (transient(e)) {
          await wait('Sensors are offline while the probe moves. Orders resume at the next stop.');
          continue;
        }
        throw e;
      }
      if (!observation) {
        await wait('No scan of the outpost sector yet.');
        continue;
      }
      // The probe may have jumped between readings: only trust a scan of the outpost itself.
      if (observation.coord && !sameCoord(observation.coord, o.coord)) {
        ctx.report('Probe position changed — re-checking.');
        await ctx.sleep(outpostTiming.afterLoadMs);
        continue;
      }
      if (remote && observation.dataFreshness && !LIVE.includes(observation.dataFreshness)) {
        await wait(`No live view of the outpost at ${formatCoord(o.coord)}. Waiting for SCUT coverage.`);
        continue;
      }
      if (remote) {
        const here = await game.sector(o.probeId, A(ctx.signal)).then(
          (r) => r.sector,
          (e) => {
            if (transient(e)) return undefined;
            throw e;
          },
        );
        if (!sharedScut(here, observation)) {
          await wait('The probe and the outpost do not share an active SCUT network right now. Waiting.');
          continue;
        }
      }

      const rock = asteroids(observation).find((r) => r.id === o.targetId);
      if (!rock || !rock.resourceTypes?.includes(o.resource)) throw new Error('The outpost asteroid or its resource is no longer reported.');
      const left = rock.resourceAmounts?.[o.resource];
      if (typeof left === 'number' && left <= 1e-6) {
        set({ status: 'complete', active: false, message: `${o.targetName} has no ${o.resource.replaceAll('_', ' ')} left. Mined ${+o.mined.toFixed(4)} ECE.` });
        return 'Asteroid exhausted';
      }
      const boxes = detachedContainers(observation);
      const box = o.containerIds
        .filter((id) => !o.fullContainerIds.includes(id))
        .map((id) => boxes.find((b) => b.id === id))
        .find((b) => b && (typeof b.raw.freeCapacity !== 'number' || b.raw.freeCapacity > 1e-6));
      if (!box) throw new Error('Every outpost container is full or missing. Recover it, add storage, or lower the target.');

      if (remote ? !atOutpost(next, o) : !(mannyReady(next) || atOutpost(next, o))) throw new Error(`${next.name} is no longer at the outpost or aboard the probe.`);

      let amount = Math.min(o.remaining[next.id] ?? 0, next.cargoCapacity ?? CARGO);
      if (typeof box.raw.freeCapacity === 'number') amount = Math.min(amount, box.raw.freeCapacity);
      if (typeof left === 'number') amount = Math.min(amount, left);
      amount = Math.floor(amount * 1e6) / 1e6;
      if (amount < 1e-6) throw new Error('The next load would be empty. Check the outpost.');

      // A departure may have started while we read the sector: never send a standing Manny out now.
      if (!remote && next.locationType !== 'probe' && departureHeld(o.probeId)) continue;
      ctx.report(`${next.name}: ordering ${amount} ECE${remote ? ' (remote)' : ''}`, o.total ? 1 - Object.values(o.remaining).reduce((a, b) => a + b, 0) / o.total : undefined);
      let accepted: { manny?: { task?: { targetAmount?: unknown } } };
      try {
        accepted = (await game.mannyAction(o.probeId, next.id, 'mine', { objectId: o.targetId, resources: [o.resource], targetAmount: amount, targetContainerId: box.id }, A(ctx.signal))) as typeof accepted;
      } catch (e) {
        if (e instanceof GameApiError && e.status === 422 && /full|capacity|space/i.test(`${e.code} ${e.message}`)) {
          set({ fullContainerIds: [...new Set([...o.fullContainerIds, box.id])], message: `${box.name} is full — trying the next container.` });
          continue;
        }
        if (e instanceof UncertainOutcomeError) throw new Error(`No confirmed reply for ${next.name}'s order. Check the game before resuming so no load is sent twice.`);
        // Refused because the probe or the Manny was momentarily busy/moving: nothing was started, so wait.
        if (transient(e) || (e instanceof GameApiError && e.status === 409 && !/scut/i.test(`${e.code} ${e.message}`))) {
          await wait(`${next.name} could not take a load yet (${errorMessage(e)}). Trying again shortly.`);
          continue;
        }
        throw e;
      }
      const got = typeof accepted?.manny?.task?.targetAmount === 'number' && accepted.manny.task.targetAmount > 0 ? accepted.manny.task.targetAmount : amount;
      const fresh = get();
      set({
        remaining: { ...fresh.remaining, [next.id]: Math.max(0, round6((fresh.remaining[next.id] ?? 0) - got)) },
        mined: fresh.mined + got,
        loads: fresh.loads + 1,
        status: 'running',
        message: `${next.name} accepted a ${+got.toFixed(4)} ECE load${remote ? ' remotely over SCUT' : ''}.`,
      });
      ctx.log(`${next.name}: ${+got.toFixed(4)} ECE → ${box.name}${remote ? ' (remote)' : ''}`, 'ok');
      void queryClient.invalidateQueries({ queryKey: keys.mannies(o.probeId) });
      await ctx.sleep(outpostTiming.afterLoadMs);
    }
  } catch (e) {
    if (isStopped(e) || ctx.signal.aborted) {
      const o = useOutposts.getState().outposts.find((x) => x.id === outpostId);
      if (o && o.status !== 'paused') set({ status: 'paused', message: 'Stopped. Resume any time; accepted loads continue in the game.' });
    } else set({ status: 'blocked', active: false, message: errorMessage(e) });
    throw e;
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

export type OutpostPlan = {
  probeId: string;
  name: string;
  targetId: string;
  targetName: string;
  resource: string;
  mannyIds: string[];
  total: number;
  /** An existing detached container on the asteroid, or an aboard container to hide there. */
  existingContainerId?: string;
  detachContainerId?: string;
};

/** Hide a container on the asteroid (if needed), then register and start the outpost. */
export function setupOutpost(game: Game, plan: OutpostPlan) {
  if (!plan.mannyIds.length) throw new Error('Choose at least one Manny to station.');
  if (!(plan.total > 0)) throw new Error('Enter how much to mine.');
  if (!plan.existingContainerId && !plan.detachContainerId) throw new Error('Choose a container for the outpost.');
  if (plan.resource === 'deuterium') throw new Error('Detached containers cannot hold deuterium.');
  return useJobs.getState().start({
    name: `Set up outpost ${plan.name}`,
    kind: 'outpost-setup',
    probeId: plan.probeId,
    claims: [{ key: 'helm' }],
    run: async (ctx) => {
      const probe = await game.probe(plan.probeId, A(ctx.signal));
      if (!probe.sector || isMoving(probe)) throw new Error('The probe must be stationary in the asteroid’s sector.');
      let containerId = plan.existingContainerId;
      if (!containerId) {
        const crew = await game.mannies(plan.probeId, A(ctx.signal));
        const worker = crew.find((m) => mannyReady(m));
        if (!worker) throw new Error('No Manny is free aboard to hide the container.');
        await ctx.acquire([{ key: 'helm' }, { key: `manny:${worker.id}` }, { key: `container:${plan.detachContainerId}` }]);
        ctx.report(`${worker.name} is hiding the container on ${plan.targetName}…`, 0.2);
        const r = (await game.mannyAction(plan.probeId, worker.id, 'detach-storage-container', { containerId: plan.detachContainerId, mode: 'hidden_on_asteroid', objectId: plan.targetId }, A(ctx.signal))) as {
          manny?: { task?: { artificialObjectDetected?: { id?: unknown } } };
        };
        const reported = r?.manny?.task?.artificialObjectDetected?.id;
        ctx.log('Container detach accepted', 'ok');
        await waitIdle(ctx, game, plan.probeId, worker.id);
        const { sector } = await game.sector(plan.probeId, A(ctx.signal));
        const found = detachedContainers(sector).filter((b) => b.raw.targetObjectId === plan.targetId);
        containerId = (reported !== undefined ? String(reported) : undefined) ?? found.at(-1)?.id;
        if (!containerId || !found.some((b) => b.id === containerId)) {
          if (found.length) containerId = found.at(-1)!.id;
          else throw new Error('The container was detached but is not visible yet. Inspect the asteroid, then create the outpost with the existing container.');
        }
        ctx.release();
      }
      const outpost: Outpost = {
        id: crypto.randomUUID(),
        probeId: plan.probeId,
        name: plan.name.trim() || plan.targetName,
        coord: probe.sector,
        targetId: plan.targetId,
        targetName: plan.targetName,
        resource: plan.resource,
        containerIds: [containerId],
        fullContainerIds: [],
        mannyIds: plan.mannyIds,
        total: plan.total,
        remaining: splitAmount(plan.total, plan.mannyIds),
        mined: 0,
        loads: 0,
        status: 'ready',
        message: 'Running. When you jump away, GUPPI waits for the crew to stand at the asteroid so they stay behind.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        active: true,
      };
      useOutposts.getState().save(outpost);
      ctx.release();
      startOutpost(game, outpost.id);
      return `Outpost ${outpost.name} is running`;
    },
  });
}

async function waitIdle(ctx: JobContext, game: Game, probeId: string, mannyId: string) {
  while (true) {
    ctx.check();
    const m = (await game.mannies(probeId, A(ctx.signal))).find((x) => x.id === mannyId);
    if (!m) throw new Error('The Manny disappeared from the crew list.');
    if (m.currentTask === null) return;
    ctx.report(`Waiting for ${m.name} to finish ${String(m.currentTask).replaceAll('_', ' ')}…`);
    await ctx.sleep(outpostTiming.idlePollMs);
  }
}

/** Resume outposts that were running when GUPPI last closed. */
export function resumeActiveOutposts(game: Game, probeIds: string[]) {
  for (const o of useOutposts.getState().outposts)
    if (o.active && probeIds.includes(o.probeId) && !outpostJob(o.id))
      try {
        startOutpost(game, o.id);
      } catch {
        /* conflicts surface on the Outposts screen */
      }
}

export { errorMessage };
