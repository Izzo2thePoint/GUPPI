/**
 * Local archive of sector observations and bookmarks. Survives restarts and is
 * shared across probes so the star map fills in as the fleet explores.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { coordKey } from '@/core/lattice';
import { allBodies, hasRefuelStation, miningTargets, type Coord, type Sector } from '@/core/models';
import { safeStorage } from './settings';

export type SectorSummary = {
  coord: Coord;
  observedAt: number;
  knowledge?: string;
  /** From a passive estimate (out of SCUT coverage) rather than a real scan. */
  estimated?: boolean;
  stars: number;
  planets: number;
  asteroids: number;
  habitable: number;
  inhabited?: number;
  danger: boolean;
  /** The game's navigational risk reading (or the estimate's danger reading). */
  risk?: string;
  scut?: boolean;
  refuel?: boolean;
  mineable?: number;
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

const HAZARD = /high|extreme|danger|black.?hole/i;

export function summarize(coord: Coord, s: Sector): SectorSummary {
  const all = allBodies(s);
  const estimated = (s.raw.estimatedObjects ?? {}) as Record<string, unknown>;
  const dangerEstimate = typeof estimated.dangerEstimate === 'string' ? estimated.dangerEstimate : undefined;
  const systems = all.filter((o) => o.type === 'solar_system');
  const stars = all.filter((o) => o.type === 'star');
  const habitable = (o: { raw: Record<string, unknown> }) =>
    o.raw.habitable === true || (o.raw.habitable === undefined && typeof o.raw.habitabilityScore === 'number' && o.raw.habitabilityScore >= 0.6);
  return {
    coord,
    observedAt: Date.now(),
    knowledge: s.knowledgeLevel,
    estimated: !all.length && (s.knowledgeLevel === 'estimated' || /estimat|passive/i.test(s.dataFreshness ?? '')) ? true : undefined,
    stars: systems.length || stars.length || (estimated.star ? 1 : 0),
    planets: all.filter((o) => o.type === 'planet').length,
    asteroids: all.filter((o) => o.type === 'asteroid').length || (typeof estimated.asteroidCount === 'number' ? estimated.asteroidCount : 0),
    habitable: all.filter(habitable).length,
    inhabited: all.filter((o) => o.raw.inhabited === true).length,
    // The same rule GUPPI 1 used against the live game: black holes, extreme bodies, or a high risk reading.
    danger: all.some((o) => o.type === 'black_hole' || o.raw.dangerLevel === 'extreme') || HAZARD.test(s.navigationalRisk ?? '') || /high|extreme/i.test(dangerEstimate ?? ''),
    risk: s.navigationalRisk ?? dangerEstimate,
    scut: s.scutCoverage === 'covered',
    refuel: hasRefuelStation(s),
    mineable: miningTargets(s).length,
    names: (systems.length ? systems : stars).map((o) => o.name).slice(0, 3),
    resources: [...new Set(all.flatMap((o) => o.resourceTypes ?? []))],
  };
}

export const useArchive = create<ArchiveState>()(
  persist(
    (set) => ({
      sectors: {},
      bookmarks: {},
      record: (coord, sector) =>
        set((s) => {
          const k = coordKey(coord);
          const next = summarize(coord, sector);
          const prev = s.sectors[k];
          // A passive estimate never replaces a real scan of the same sector.
          if (prev && !prev.estimated && next.estimated) return s;
          return { sectors: { ...s.sectors, [k]: next } };
        }),
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

/** Archive any observation that knows (or is told) where it was taken. */
export function archiveSector(sector: Sector | undefined, fallback?: Coord) {
  const c = sector?.coord ?? fallback;
  if (sector && c) useArchive.getState().record(c, sector);
}
