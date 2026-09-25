/**
 * Built-in automations. Each one is a Job (see jobs.ts): it reserves the
 * resources it touches, polls at automation priority, and stops cleanly.
 */
import type { Game } from '@/core/game';
import type { Coord, Manny } from '@/core/models';
import { isMoving, mannyReady } from '@/core/models';
import { coordKey, formatCoord, hops, neighbors, sameCoord } from '@/core/lattice';
import { canCraft, planCraft } from '@/core/craft';
import { compile, isRead, operation, type Command } from '@/core/catalog';
import { GameApiError, errorMessage } from '@/core/errors';
import type { Claim } from '@/core/claims';
import { claimsFor } from '@/core/claims';
import { queryClient } from './query';
import { keys } from './hooks';
import { useArchive } from './archive';
import { useJobs, type JobContext } from './jobs';

const A = (signal: AbortSignal) => ({ priority: 'automation' as const, signal });
const refresh = (probeId: string) => {
  void queryClient.invalidateQueries({ queryKey: keys.mannies(probeId) });
  void queryClient.invalidateQueries({ queryKey: keys.probe(probeId) });
};

async function waitForReady(ctx: JobContext, game: Game, probeId: string, pick: (m: Manny[]) => Manny | undefined, what: string, pollMs = 15_000) {
  while (true) {
    ctx.check();
    const crew = await game.mannies(probeId, A(ctx.signal));
    const m = pick(crew);
    if (m) return { manny: m, crew };
    ctx.report(`Waiting for ${what}…`);
    await ctx.sleep(pollMs);
  }
}

// ── Neighbour / sector scans ────────────────────────────────────────────────
export function startScan(game: Game, probeId: string, center: Coord, extra: Coord[] = []) {
  const points = [...neighbors(center), ...extra].filter((c, i, all) => all.findIndex((x) => sameCoord(x, c)) === i);
  return useJobs.getState().start({
    name: `Scan around ${formatCoord(center)}`,
    kind: 'scan',
    probeId,
    run: async (ctx) => {
      let ok = 0;
      for (let i = 0; i < points.length; i++) {
        ctx.check();
        const c = points[i];
        ctx.report(`Observing ${formatCoord(c)} (${i + 1}/${points.length})`, i / points.length);
        try {
          const s = await game.observeSector(c, A(ctx.signal));
          if (s) useArchive.getState().record(c, s);
          ok++;
          ctx.log(`${formatCoord(c)} — ${s?.objects.length ?? 0} objects`);
        } catch (e) {
          if (e instanceof GameApiError && e.status === 401) throw e;
          ctx.log(`${formatCoord(c)} — ${errorMessage(e)}`, 'warn');
        }
      }
      return `${ok} of ${points.length} sectors observed`;
    },
  });
}

// ── Voyages ────────────────────────────────────────────────────────────────
export function startVoyage(game: Game, probeId: string, probeName: string, legs: Coord[], opts: { scanOnArrival: boolean; minDeuterium: number }) {
  return useJobs.getState().start({
    name: `Voyage: ${probeName} → ${formatCoord(legs.at(-1))}`,
    kind: 'voyage',
    probeId,
    claims: [{ key: 'helm' }],
    exclusive: true,
    run: async (ctx) => {
      for (let i = 0; i < legs.length; i++) {
        const target = legs[i];
        ctx.check();
        let p = await game.probe(probeId, A(ctx.signal));
        if (sameCoord(p.sector, target)) continue;
        if (isMoving(p)) throw new Error('The probe is already moving. Wait for it to arrive first.');
        if (opts.minDeuterium > 0 && (p.deuterium ?? 0) < opts.minDeuterium)
          throw new Error(`Deuterium ${p.deuterium ?? '?'}% is below the ${opts.minDeuterium}% reserve. Voyage paused for safety.`);
        ctx.report(`Leg ${i + 1}/${legs.length}: jumping to ${formatCoord(target)}`, i / legs.length);
        await game.move(probeId, target, A(ctx.signal));
        ctx.log(`Jump to ${formatCoord(target)} accepted`, 'ok');
        refresh(probeId);
        while (true) {
          await ctx.sleep(15_000);
          p = await game.probe(probeId, A(ctx.signal));
          if (!isMoving(p) && sameCoord(p.sector, target)) break;
          if (!isMoving(p) && !sameCoord(p.sector, target)) throw new Error(`Jump ended at ${formatCoord(p.sector)} instead of ${formatCoord(target)}.`);
          const eta = p.movement?.arrivalAt ? Math.max(0, (Date.parse(p.movement.arrivalAt) - Date.now()) / 1000) : undefined;
          ctx.report(`Leg ${i + 1}/${legs.length}: ${p.status}${eta !== undefined ? ` · ETA ${Math.ceil(eta / 60)} min` : ''}`, (i + 0.5) / legs.length);
        }
        ctx.log(`Arrived at ${formatCoord(target)}`, 'ok');
        refresh(probeId);
        void queryClient.invalidateQueries({ queryKey: keys.probes });
        if (opts.scanOnArrival) {
          try {
            const { sector } = await game.sector(probeId, A(ctx.signal));
            if (sector) useArchive.getState().record(target, sector);
          } catch (e) {
            ctx.log(`Local scan failed: ${errorMessage(e)}`, 'warn');
          }
          for (const c of neighbors(target)) {
            ctx.check();
            try {
              const s = await game.observeSector(c, A(ctx.signal));
              if (s) useArchive.getState().record(c, s);
            } catch (e) {
              ctx.log(`Scan ${formatCoord(c)}: ${errorMessage(e)}`, 'warn');
            }
          }
          ctx.log(`Scanned 12 neighbours of ${formatCoord(target)}`);
        }
      }
      return `Arrived at ${formatCoord(legs.at(-1))}`;
    },
  });
}

// ── Craft queues ─────────────────────────────────────────────────────────────
export function startCraftQueue(
  game: Game,
  probeId: string,
  opts: { recipeId: string; recipeName: string; count: number; printer: boolean; mannyIds?: string[]; waitForCompletion: boolean },
) {
  return useJobs.getState().start({
    name: `Craft ${opts.count} × ${opts.recipeName}`,
    kind: 'craft',
    probeId,
    run: async (ctx) => {
      const recipes = await game.recipes(A(ctx.signal));
      const recipe = recipes.find((r) => r.id === opts.recipeId);
      if (!recipe) throw new Error('Recipe no longer available.');
      const used = new Set<string>();
      for (let n = 0; n < opts.count; n++) {
        ctx.check();
        const probe = await game.probe(probeId, A(ctx.signal));
        const hasPrinter = !!probe.inventory?.items.some((i) => i.type === 'atomic_3d_printer');
        const plan = planCraft(recipe, recipes, probe.inventory, probe.deuterium);
        if (!canCraft(plan, hasPrinter)) {
          const missing = Object.entries(plan.missing).map(([k, v]) => `${k.replaceAll('_', ' ')} ${+v.toFixed(4)}`);
          throw new Error(`Stopped after ${n}: missing ${missing.join(', ') || 'an atomic printer'}.`);
        }
        const { manny } = await waitForReady(
          ctx,
          game,
          probeId,
          (crew) => crew.find((m) => mannyReady(m) && (!opts.mannyIds?.length || opts.mannyIds.includes(m.id)) && !ctx.job.claims.some((c) => c.key === `manny:${m.id}`)),
          opts.printer ? 'an idle Manny to assist the printer' : 'an idle Manny',
        );
        const claims: Claim[] = [{ key: `manny:${manny.id}` }, ...(opts.printer ? [{ key: 'printer' }] : [])];
        await ctx.acquire(claims);
        ctx.report(`${n + 1}/${opts.count}: ${manny.name} ${opts.printer ? 'assisting printer' : 'crafting'}`, n / opts.count);
        if (opts.printer) await game.printerCraft(probeId, opts.recipeId, A(ctx.signal));
        else await game.mannyAction(probeId, manny.id, 'craft', { recipe: opts.recipeId }, A(ctx.signal));
        used.add(manny.id);
        ctx.log(`#${n + 1} accepted — ${manny.name}`, 'ok');
        ctx.release();
        refresh(probeId);
      }
      if (opts.waitForCompletion) {
        ctx.report('Waiting for the last crafts to finish…', 0.99);
        await waitForReady(ctx, game, probeId, (crew) => (crew.filter((m) => used.has(m.id)).every((m) => !m.currentTask) ? crew[0] : undefined), 'crafts to finish');
        refresh(probeId);
      }
      return `${opts.count} × ${opts.recipeName} ${opts.waitForCompletion ? 'crafted' : 'ordered'}`;
    },
  });
}

// ── Mining runs ──────────────────────────────────────────────────────────────
/** A Manny cargo holds 0.05 ECE per trip unless the game reports otherwise. */
export const DEFAULT_CARGO = 0.05;
/** Poll intervals (tests shorten them). */
export const miningTiming = { waitMs: 10_000, afterLoadMs: 5000 };

/** Idle and able to take a local order: aboard, or parked outside in the probe's own sector. */
export const localReady = (m: Manny, here?: Coord) =>
  m.currentTask === null && m.canReceiveOrders && (m.locationType === 'probe' || (m.locationType === 'sector' && sameCoord(m.locationSector, here)));

export type MiningRunOptions = {
  mannyIds: string[];
  objectId: string;
  objectName: string;
  resources: string[];
  /** Total to mine in ECE, split into cargo-sized loads across the Mannies. */
  total: number;
  targetContainerId?: string;
  /** Stop when probe cargo free space drops to this (solid resources into the probe). */
  stopWhenFreeBelow: number;
};

export function startMiningRun(game: Game, probeId: string, opts: MiningRunOptions) {
  const deuterium = opts.resources.length === 1 && opts.resources[0] === 'deuterium';
  if (!opts.mannyIds.length) throw new Error('Choose at least one Manny.');
  if (!(opts.total > 0)) throw new Error('Enter an amount to mine.');
  if (opts.targetContainerId && opts.resources.includes('deuterium')) throw new Error('Detached containers cannot receive deuterium; mine it into the probe tank.');
  return useJobs.getState().start({
    name: deuterium ? `Refuel from ${opts.objectName} (+${Math.round(opts.total * 100)} pts)` : `Mine ${opts.objectName} · ${opts.total} ECE`,
    kind: 'mining',
    probeId,
    claims: [...opts.mannyIds.map((id) => ({ key: `manny:${id}` })), { key: `asteroid:${opts.objectId}`, shared: true }],
    run: async (ctx) => {
      let remaining = opts.total;
      let loads = 0;
      const mine = new Set(opts.mannyIds);
      while (true) {
        ctx.check();
        const [probe, crew] = await Promise.all([game.probe(probeId, A(ctx.signal)), game.mannies(probeId, A(ctx.signal))]);
        const ours = crew.filter((m) => mine.has(m.id));
        const busy = ours.filter((m) => m.currentTask);
        if (remaining <= 1e-6) {
          if (busy.length) {
            ctx.report(`All loads ordered — waiting for ${busy.length} Manny${busy.length > 1 ? 's' : ''} to finish`, 0.98);
            await ctx.sleep(miningTiming.waitMs);
            continue;
          }
          refresh(probeId);
          return `${loads} loads mined · ${+(opts.total - remaining).toFixed(4)} ECE`;
        }
        if (deuterium && (probe.deuterium ?? 0) >= (probe.deuteriumCapacity ?? 100) - 0.5) return `Tank full after ${loads} loads`;
        const free = probe.inventory?.freeCapacity ?? Infinity;
        if (!deuterium && !opts.targetContainerId && free <= opts.stopWhenFreeBelow) return `Cargo nearly full after ${loads} loads (${free} free)`;
        const idle = ours.filter((m) => localReady(m, probe.sector));
        if (!idle.length) {
          ctx.report(`${+(opts.total - remaining).toFixed(4)} / ${opts.total} ECE ordered — waiting for a Manny to dock`, 1 - remaining / opts.total);
          await ctx.sleep(miningTiming.waitMs);
          continue;
        }
        for (const m of idle) {
          if (remaining <= 1e-6) break;
          let amount = Math.min(remaining, m.cargoCapacity ?? DEFAULT_CARGO);
          if (!deuterium && !opts.targetContainerId) amount = Math.min(amount, free - opts.stopWhenFreeBelow);
          amount = Math.floor(amount * 1e6) / 1e6;
          if (amount < 1e-6) break;
          const r = (await game.mannyAction(
            probeId,
            m.id,
            'mine',
            { objectId: opts.objectId, targetAmount: amount, resources: opts.resources, ...(opts.targetContainerId ? { targetContainerId: opts.targetContainerId } : {}) },
            A(ctx.signal),
          )) as { manny?: { task?: { targetAmount?: unknown } } };
          // Count what the game actually accepted; it may cap the load.
          const accepted = typeof r?.manny?.task?.targetAmount === 'number' && r.manny.task.targetAmount > 0 ? r.manny.task.targetAmount : amount;
          remaining = Math.max(0, remaining - accepted);
          loads++;
          ctx.log(`${m.name}: load ${loads} accepted (${+accepted.toFixed(4)} ECE)`, 'ok');
        }
        refresh(probeId);
        await ctx.sleep(miningTiming.afterLoadMs);
      }
    },
  });
}

// ── Custom routines ──────────────────────────────────────────────────────────
export type RoutineStep =
  | { id: string; kind: 'command'; command: Command }
  | { id: string; kind: 'wait'; seconds: number }
  | { id: string; kind: 'until'; command: Command; field: string; expected: string; every: number; timeout: number };

export type Routine = { id: string; name: string; steps: RoutineStep[]; cycles: number; interval: number; updatedAt: number };

export function readPath(data: unknown, path: string): unknown {
  let v: unknown = data;
  for (const k of path.split('.').filter(Boolean)) {
    if (v === null || typeof v !== 'object') return undefined;
    v = Array.isArray(v) && /^\d+$/.test(k) ? v[Number(k)] : (v as Record<string, unknown>)[k];
  }
  return v;
}

export function matches(data: unknown, path: string, expected: string) {
  let target: unknown;
  try {
    target = JSON.parse(expected);
  } catch {
    target = expected;
  }
  return JSON.stringify(readPath(data, path)) === JSON.stringify(target);
}

export function validateRoutine(r: Routine, probeId: string) {
  if (!r.name.trim()) throw new Error('Name the routine.');
  if (!r.steps.length) throw new Error('Add at least one step.');
  if (!Number.isInteger(r.cycles) || r.cycles < 1 || r.cycles > 1000) throw new Error('Cycles must be 1–1000.');
  if (!(r.interval >= 0 && r.interval <= 86400)) throw new Error('Interval must be 0–86400 seconds.');
  for (const [i, s] of r.steps.entries()) {
    const where = `Step ${i + 1}`;
    if (s.kind === 'wait' && !(s.seconds >= 1 && s.seconds <= 86400)) throw new Error(`${where}: wait 1–86400 seconds.`);
    if (s.kind !== 'wait') {
      try {
        compile({ ...s.command, params: { ...s.command.params, probeId } });
      } catch (e) {
        throw new Error(`${where}: ${errorMessage(e)}`);
      }
    }
    if (s.kind === 'until') {
      if (!isRead(s.command.operation)) throw new Error(`${where}: conditions can only poll a GET endpoint.`);
      if (!s.field.trim()) throw new Error(`${where}: set a response field.`);
      if (!(s.every >= 10)) throw new Error(`${where}: poll at most every 10 seconds.`);
      if (!(s.timeout >= s.every && s.timeout <= 7 * 86400)) throw new Error(`${where}: timeout must be ≥ poll interval and ≤ 7 days.`);
    }
  }
}

export function startRoutine(game: Game, probeId: string, r: Routine, dry: boolean) {
  validateRoutine(r, probeId);
  const claims = r.steps.flatMap((s) => (s.kind === 'command' ? claimsFor(s.command.operation, s.command.params ?? {}, s.command.body) : []));
  const unique = claims.filter((c, i) => claims.findIndex((x) => x.key === c.key) === i);
  return useJobs.getState().start({
    name: `${dry ? 'Dry run' : 'Routine'}: ${r.name}`,
    kind: 'routine',
    probeId,
    claims: dry ? [] : unique,
    run: async (ctx) => {
      const total = r.cycles * r.steps.length;
      for (let cycle = 0; cycle < r.cycles; cycle++) {
        for (const [i, s] of r.steps.entries()) {
          ctx.check();
          const done = cycle * r.steps.length + i;
          const where = `Cycle ${cycle + 1}/${r.cycles} · step ${i + 1}`;
          if (s.kind === 'wait') {
            ctx.report(`${where}: wait ${s.seconds}s`, done / total);
            if (!dry) await ctx.sleep(s.seconds * 1000);
            continue;
          }
          const command = { ...s.command, params: { ...s.command.params, probeId } };
          const title = operation(command.operation).title;
          if (dry) {
            compile(command);
            ctx.log(`${where}: ✓ ${title}`);
            continue;
          }
          if (s.kind === 'command') {
            ctx.report(`${where}: ${title}`, done / total);
            await game.raw(command, A(ctx.signal));
            ctx.log(`${where}: ${title}`, 'ok');
            refresh(probeId);
          } else {
            const end = Date.now() + s.timeout * 1000;
            while (true) {
              ctx.check();
              const data = await game.raw(command, A(ctx.signal));
              if (matches(data, s.field, s.expected)) {
                ctx.log(`${where}: ${s.field} = ${s.expected}`, 'ok');
                break;
              }
              if (Date.now() >= end) throw new Error(`${where}: timed out waiting for ${s.field} = ${s.expected}`);
              ctx.report(`${where}: waiting for ${s.field} = ${s.expected} (now ${JSON.stringify(readPath(data, s.field))})`, done / total);
              await ctx.sleep(s.every * 1000);
            }
          }
        }
        if (cycle + 1 < r.cycles && r.interval && !dry) {
          ctx.report(`Cycle ${cycle + 1} done — next in ${r.interval}s`, ((cycle + 1) * r.steps.length) / total);
          await ctx.sleep(r.interval * 1000);
        }
      }
      return dry ? 'Every step validated — nothing was sent' : `${r.cycles} cycle(s) complete`;
    },
  });
}

export const routeHops = (from: Coord, legs: Coord[]) => legs.reduce((n, c, i) => n + hops(i ? legs[i - 1] : from, c), 0);
export { coordKey };
