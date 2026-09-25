/**
 * Mirrors the game's recursive ingredient preparation: direct ingredients are
 * reserved from stock first, missing components are expanded through their own
 * recipes, and raw shortfalls are reported.
 */
import type { Inventory, Recipe } from './models';

export type CraftPlan = {
  used: Record<string, number>;
  raw: Record<string, number>;
  prepare: Record<string, number>;
  missing: Record<string, number>;
  durationSeconds: number;
  needsPrinter: boolean;
};

export function stockOf(inventory: Inventory | undefined, deuteriumPercent?: number): Record<string, number> {
  const stock: Record<string, number> = {};
  for (const i of inventory?.items ?? []) stock[i.type] = (stock[i.type] ?? 0) + 1;
  for (const r of inventory?.resourceStocks ?? []) stock[r.type] = (stock[r.type] ?? 0) + r.amount;
  if (deuteriumPercent !== undefined) stock.deuterium = deuteriumPercent / 100;
  return stock;
}

export function planCraft(recipe: Recipe, recipes: Recipe[], inventory: Inventory | undefined, deuteriumPercent?: number, count = 1): CraftPlan {
  const plan: CraftPlan = { used: {}, raw: {}, prepare: {}, missing: {}, durationSeconds: 0, needsPrinter: false };
  const stock = stockOf(inventory, deuteriumPercent);
  const add = (map: Record<string, number>, key: string, n: number) => (map[key] = (map[key] ?? 0) + n);
  let steps = 0;
  const build = (r: Recipe, n: number, path: Set<string>) => {
    if (++steps > 10_000 || path.has(r.id) || path.size > 30) throw new Error('Recipe dependencies are cyclic or too large.');
    plan.durationSeconds += r.durationSeconds * n;
    if (r.craftableBy.includes('atomic_3d_printer') && !r.craftableBy.includes('manny')) plan.needsPrinter = true;
    const next = new Set(path).add(r.id);
    const unfilled: { type: string; quantity: number }[] = [];
    for (const i of r.ingredients) {
      const amount = i.quantity * n;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const used = Math.min(stock[i.type] ?? 0, amount);
      stock[i.type] = (stock[i.type] ?? 0) - used;
      if (i.unit === 'item') {
        if (used) add(plan.used, i.type, used);
        if (amount - used > 1e-9) unfilled.push({ type: i.type, quantity: amount - used });
      } else {
        add(plan.raw, i.type, amount);
        if (amount - used > 1e-9) add(plan.missing, i.type, amount - used);
      }
    }
    for (const i of unfilled) {
      const child = recipes.find((c) => c.outputType === i.type);
      if (!child) {
        add(plan.missing, i.type, i.quantity);
        continue;
      }
      add(plan.prepare, i.type, i.quantity);
      build(child, i.quantity, next);
    }
  };
  build(recipe, count, new Set());
  return plan;
}

export const canCraft = (plan: CraftPlan, hasPrinter: boolean) => !Object.keys(plan.missing).length && (!plan.needsPrinter || hasPrinter);

/** How many of a recipe current stock supports (capped). */
export function maxCraftable(recipe: Recipe, recipes: Recipe[], inventory: Inventory | undefined, hasPrinter: boolean, cap = 50) {
  let lo = 0;
  for (let n = 1; n <= cap; n++) {
    try {
      if (!canCraft(planCraft(recipe, recipes, inventory, undefined, n), hasPrinter)) break;
      lo = n;
    } catch {
      break;
    }
  }
  return lo;
}
