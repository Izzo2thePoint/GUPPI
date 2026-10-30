/**
 * Mining outposts: Mannies stationed in a sector, delivering loads into a
 * storage container hidden on an asteroid. GUPPI keeps ordering loads after
 * the probe leaves, whenever the probe and the outpost share a SCUT network.
 * Outposts are saved locally so they survive restarts.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Coord, Manny } from '@/core/models';
import { sameCoord } from '@/core/lattice';
import { safeStorage } from './settings';

export type OutpostStatus = 'setup' | 'ready' | 'running' | 'waiting' | 'paused' | 'complete' | 'blocked';

export type Outpost = {
  id: string;
  probeId: string;
  name: string;
  coord: Coord;
  targetId: string;
  targetName: string;
  resource: string;
  /** Detached containers on the asteroid that receive the ore, in order of preference. */
  containerIds: string[];
  fullContainerIds: string[];
  mannyIds: string[];
  total: number;
  /** ECE still to be ordered, per Manny. */
  remaining: Record<string, number>;
  mined: number;
  loads: number;
  status: OutpostStatus;
  message: string;
  createdAt: number;
  updatedAt: number;
  /** True while GUPPI should keep this outpost running (resumes on restart). */
  active: boolean;
};

type OutpostsState = {
  outposts: Outpost[];
  save: (o: Outpost) => void;
  patch: (id: string, patch: Partial<Outpost>) => void;
  remove: (id: string) => void;
  /** Drop outposts that are finished or abandoned (used when the archive is cleared). */
  forgetFinished: () => void;
};

export function splitAmount(total: number, ids: string[]): Record<string, number> {
  const units = Math.round(total * 1e6);
  const base = Math.floor(units / ids.length);
  const extra = units % ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, (base + (i < extra ? 1 : 0)) / 1e6]));
}

export const useOutposts = create<OutpostsState>()(
  persist(
    (set) => ({
      outposts: [],
      save: (o) =>
        set((s) => {
          const i = s.outposts.findIndex((x) => x.id === o.id);
          const next = { ...o, updatedAt: Date.now() };
          return { outposts: i >= 0 ? s.outposts.map((x, j) => (j === i ? next : x)) : [...s.outposts, next] };
        }),
      patch: (id, patch) => set((s) => ({ outposts: s.outposts.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x)) })),
      remove: (id) => set((s) => ({ outposts: s.outposts.filter((x) => x.id !== id) })),
      forgetFinished: () => set((s) => ({ outposts: s.outposts.filter((o) => !['complete', 'blocked'].includes(o.status)) })),
    }),
    {
      name: 'guppi2.outposts',
      storage: safeStorage,
      version: 1,
      merge: (persisted, current) => {
        const list = (persisted as { outposts?: unknown })?.outposts;
        const valid = Array.isArray(list)
          ? (list.filter((o) => o && typeof o.id === 'string' && Array.isArray(o.mannyIds) && Array.isArray(o.containerIds) && o.coord) as Outpost[])
          : [];
        return { ...current, outposts: valid };
      },
    },
  ),
);

// ── Leaving an outpost behind ───────────────────────────────────────────────
//
// A Manny only stays at the outpost when it is standing there idle
// (`location.type: 'sector'`) as the probe leaves. One still aboard, on its first
// trip out, or partway through a load is pulled back with the probe. So before a
// jump, GUPPI holds new loads and waits for every outpost Manny to be standing
// at the asteroid.

type DepartureState = { holds: Record<string, number>; hold: (probeId: string) => () => void };

/** Probes about to leave: their outposts stop sending new local loads. */
export const useDeparture = create<DepartureState>((set) => ({
  holds: {},
  hold: (probeId) => {
    set((s) => ({ holds: { ...s.holds, [probeId]: (s.holds[probeId] ?? 0) + 1 } }));
    let done = false;
    return () => {
      if (done) return;
      done = true;
      set((s) => {
        const n = (s.holds[probeId] ?? 1) - 1;
        const holds = { ...s.holds };
        if (n > 0) holds[probeId] = n;
        else delete holds[probeId];
        return { holds };
      });
    };
  },
}));

export const departureHeld = (probeId: string) => (useDeparture.getState().holds[probeId] ?? 0) > 0;

export type DepartureIssue = { outpost: string; manny: string; text: string };

/**
 * What still stops the crew of active outposts in the probe's current sector
 * from staying behind if it jumps now. Empty means it is safe to leave.
 */
export function departureIssues(outposts: Outpost[], probeId: string, here: Coord | undefined, crew: Manny[]): DepartureIssue[] {
  if (!here) return [];
  const out: DepartureIssue[] = [];
  for (const o of outposts) {
    if (!o.active || o.probeId !== probeId || !sameCoord(o.coord, here)) continue;
    for (const id of o.mannyIds) {
      if ((o.remaining[id] ?? 0) <= 1e-6) continue;
      const m = crew.find((x) => x.id === id);
      if (!m || m.currentTask === 'unknown_too_far') continue;
      const standing = m.locationType === 'sector' && sameCoord(m.locationSector, o.coord);
      if (standing && m.currentTask === null) continue;
      const text =
        m.locationType === 'probe' && m.currentTask === null
          ? `${m.name} is still aboard`
          : m.currentTask === 'mining' && !standing
            ? `${m.name} is on its first trip to ${o.targetName}`
            : m.currentTask === 'mining'
              ? `${m.name} is finishing a load`
              : `${m.name} is busy (${String(m.currentTask).replaceAll('_', ' ')})`;
      out.push({ outpost: o.name, manny: m.name, text });
    }
  }
  return out;
}

export const describeIssues = (issues: DepartureIssue[]) =>
  issues.length ? `Outpost crew not ready to stay behind: ${issues.map((i) => i.text).join('; ')}.` : '';

export const outpostsHere = (outposts: Outpost[], probeId: string, here?: Coord) =>
  outposts.filter((o) => o.active && o.probeId === probeId && !!here && sameCoord(o.coord, here));

