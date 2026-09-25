/**
 * Local archive of sector observations and bookmarks. Survives restarts and is
 * shared across probes so the star map fills in as the fleet explores.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { coordKey } from '@/core/lattice';
import type { Coord, Sector } from '@/core/models';
import { safeStorage } from './settings';

export type SectorSummary = {
  coord: Coord;
  observedAt: number;
  knowledge?: string;
  stars: number;
  planets: number;
  asteroids: number;
  habitable: number;
  danger: boolean;
  names: string[];
  resources: string[];
};

export type Bookmark = { coord: Coord; name: string; note?: string; createdAt: number };

type ArchiveState = {
  sectors: Record<string, SectorSummary>;
  bookmarks: Record<string, Bookmark>;
  record: (coord: Coord, sector: Sector) => void;
  bookmark: (coord: Coord, name: string, note?: string) => void;
  unbookmark: (coord: Coord) => void;
  clear: () => void;
};

export function summarize(coord: Coord, s: Sector): SectorSummary {
  const all: { type: string; name: string; raw: Record<string, unknown>; resourceTypes?: string[] }[] = [];
  const walk = (list: Sector['objects']) => list.forEach((o) => (all.push(o), walk(o.children)));
  walk(s.objects);
  const estimated = (s.raw.estimatedObjects ?? {}) as Record<string, unknown>;
  return {
    coord,
    observedAt: Date.now(),
    knowledge: s.knowledgeLevel,
    stars: all.filter((o) => o.type === 'solar_system' || o.type === 'star').length || (estimated.star ? 1 : 0),
    planets: all.filter((o) => o.type === 'planet').length,
    asteroids: all.filter((o) => o.type === 'asteroid').length || (typeof estimated.asteroidCount === 'number' ? estimated.asteroidCount : 0),
    habitable: all.filter((o) => o.raw.habitable === true).length,
    danger: all.some((o) => o.type === 'black_hole' || o.raw.dangerLevel === 'extreme'),
    names: all.filter((o) => o.type === 'solar_system').map((o) => o.name).slice(0, 3),
    resources: [...new Set(all.flatMap((o) => o.resourceTypes ?? []))],
  };
}

export const useArchive = create<ArchiveState>()(
  persist(
    (set) => ({
      sectors: {},
      bookmarks: {},
      record: (coord, sector) => set((s) => ({ sectors: { ...s.sectors, [coordKey(coord)]: summarize(coord, sector) } })),
      bookmark: (coord, name, note) => set((s) => ({ bookmarks: { ...s.bookmarks, [coordKey(coord)]: { coord, name, note, createdAt: Date.now() } } })),
      unbookmark: (coord) =>
        set((s) => {
          const next = { ...s.bookmarks };
          delete next[coordKey(coord)];
          return { bookmarks: next };
        }),
      clear: () => set({ sectors: {}, bookmarks: {} }),
    }),
    { name: 'guppi2.archive', storage: safeStorage, version: 1 },
  ),
);
