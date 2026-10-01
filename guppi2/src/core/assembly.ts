/**
 * Building a new probe (`assemble-probe`). The parts come from the catalog's
 * description of the endpoint (and GUPPI 1.16's live-tested list); the plan
 * reuses the craft planner, so shortfalls expand into the sub-parts and raw
 * materials the game will need, using what is aboard first.
 */
import { planCraft, type CraftPlan } from './craft';
import type { Container, Inventory, Recipe } from './models';

export type ProbeModel = 'generic' | 'deuterium_tanker';

export const PROBE_MODELS: { id: ProbeModel; name: string; summary: string }[] = [
  { id: 'generic', name: 'Standard probe', summary: 'A drone probe that explores and mines like this one.' },
  { id: 'deuterium_tanker', name: 'Deuterium tanker', summary: 'Carries extra deuterium to refuel the fleet. Needs more parts.' },
];

/** Assembly time in seconds (a three-hour exterior Manny task). */
export const ASSEMBLY_SECONDS = 3 * 3600;
export const CONTAINERS_NEEDED = 2;

export function assemblyParts(model: ProbeModel): Record<string, number> {
  return {
    deuterium_engine: 1,
    scut_relay: 1,
    electric_motor: 5,
    atomic_printer_part: 2,
    solar_panel: 4,
    ...(model === 'deuterium_tanker' ? { steel_plate: 10, linear_actuator: 2, integrated_circuit: 1 } : {}),
  };
}

/** Additional containers the assembly can take: aboard and completely empty. */
export const emptyContainers = (inv?: Inventory): Container[] =>
  (inv?.containers ?? []).filter((c) => (c.kind ?? 'container') === 'container' && (c.usedCapacity ?? 0) <= 1e-9);

export type PartLine = { type: string; need: number; have: number; short: number; craftable: boolean; printer: boolean };

export type AssemblyPlan = {
  model: ProbeModel;
  parts: PartLine[];
  containers: { need: number; empty: Container[] };
  /** How to make every short part from what is aboard (sub-parts first, then raw materials). */
  build: CraftPlan;
  /** Parts with no recipe: they must be found, salvaged or traded. */
  unobtainable: string[];
  ready: boolean;
  /** 0–1: parts in hand out of parts needed (containers count as parts). */
  progress: number;
};

const itemCount = (inv: Inventory | undefined, type: string) => (inv?.items ?? []).filter((i) => i.type === type && !i.currentTask).length;

export function planAssembly(model: ProbeModel, inventory: Inventory | undefined, recipes: Recipe[]): AssemblyPlan {
  const needs = assemblyParts(model);
  const byOutput = (t: string) => recipes.find((r) => r.outputType === t);
  const parts: PartLine[] = Object.entries(needs).map(([type, need]) => {
    const have = itemCount(inventory, type);
    const r = byOutput(type);
    return { type, need, have, short: Math.max(0, need - have), craftable: !!r, printer: !!r && r.craftableBy.includes('atomic_3d_printer') && !r.craftableBy.includes('manny') };
  });
  const empty = emptyContainers(inventory);
  const containersShort = Math.max(0, CONTAINERS_NEEDED - empty.length);
  // One synthetic recipe for everything still missing: the planner then spends stock once, fairly.
  const shortfall = [...parts.filter((p) => p.short > 0).map((p) => ({ type: p.type, quantity: p.short, unit: 'item' as const }))];
  if (containersShort && byOutput('additional_container')) shortfall.push({ type: 'additional_container', quantity: containersShort, unit: 'item' });
  // Parts already counted as "have" are set aside, so the planner cannot spend them on sub-parts.
  const reserved: Inventory | undefined = inventory && {
    ...inventory,
    items: (() => {
      const keep = { ...needs };
      return inventory.items.filter((i) => {
        if ((keep[i.type] ?? 0) > 0 && !i.currentTask) {
          keep[i.type]--;
          return false;
        }
        return true;
      });
    })(),
  };
  const synthetic: Recipe = { id: 'probe_assembly', name: 'Probe assembly', durationSeconds: 0, craftableBy: ['manny'], ingredients: shortfall, outputType: 'probe', raw: {} };
  const build = shortfall.length
    ? planCraft(synthetic, recipes, reserved)
    : { used: {}, raw: {}, prepare: {}, missing: {}, durationSeconds: 0, needsPrinter: false };
  const unobtainable = parts.filter((p) => p.short > 0 && !p.craftable).map((p) => p.type);
  const total = parts.reduce((n, p) => n + p.need, 0) + CONTAINERS_NEEDED;
  const inHand = parts.reduce((n, p) => n + Math.min(p.have, p.need), 0) + Math.min(empty.length, CONTAINERS_NEEDED);
  return {
    model,
    parts,
    containers: { need: CONTAINERS_NEEDED, empty },
    build,
    unobtainable,
    ready: parts.every((p) => p.short === 0) && empty.length >= CONTAINERS_NEEDED,
    progress: total ? inHand / total : 0,
  };
}
