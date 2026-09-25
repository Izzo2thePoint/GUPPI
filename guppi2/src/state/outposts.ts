/**
 * Mining outposts: Mannies stationed in a sector, delivering loads into a
 * storage container hidden on an asteroid. GUPPI keeps ordering loads after
 * the probe leaves, whenever the probe and the outpost share a SCUT network.
 * Outposts are saved locally so they survive restarts.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Coord } from '@/core/models';
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
