/**
 * Missiles this GUPPI has fired, so Tactical can follow each one through
 * preparation, flight and impact with `GET .../missiles/{id}`. Session-only:
 * a missile's story is over within minutes.
 */
import { create } from 'zustand';

export type Launch = { probeId: string; id: string; targetName: string; at: number };

type LaunchState = {
  launches: Launch[];
  add: (l: Launch) => void;
  remove: (id: string) => void;
};

export const useLaunches = create<LaunchState>()((set) => ({
  launches: [],
  add: (l) => set((s) => ({ launches: [l, ...s.launches.filter((x) => x.id !== l.id)].slice(0, 20) })),
  remove: (id) => set((s) => ({ launches: s.launches.filter((x) => x.id !== id) })),
}));
