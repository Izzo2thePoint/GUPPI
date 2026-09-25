import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Routine } from './automations';
import { safeStorage } from './settings';

type RoutinesState = {
  routines: Routine[];
  save: (r: Routine) => void;
  remove: (id: string) => void;
};

export const useRoutines = create<RoutinesState>()(
  persist(
    (set) => ({
      routines: [],
      save: (r) =>
        set((s) => {
          const next = { ...r, updatedAt: Date.now() };
          const i = s.routines.findIndex((x) => x.id === r.id);
          return { routines: i >= 0 ? s.routines.map((x, j) => (j === i ? next : x)) : [...s.routines, next] };
        }),
      remove: (id) => set((s) => ({ routines: s.routines.filter((r) => r.id !== id) })),
    }),
    {
      name: 'guppi2.routines',
      storage: safeStorage,
      version: 1,
      merge: (persisted, current) => {
        const list = (persisted as { routines?: unknown })?.routines;
        return { ...current, routines: Array.isArray(list) ? (list.filter((r) => r && typeof r.id === 'string' && Array.isArray(r.steps)) as Routine[]) : [] };
      },
    },
  ),
);
