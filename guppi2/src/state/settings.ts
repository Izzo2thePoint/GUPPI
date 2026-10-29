import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** An accent id from theme.ts (older saves used cyan/violet/emerald/amber; theme.ts maps them). */
export type Accent = string;

export type Settings = {
  accent: Accent;
  reduceMotion: boolean;
  compact: boolean;
  /** Seconds between background refreshes of the selected probe. */
  pollProbe: number;
  pollCrew: number;
  pollFleet: number;
  pollComms: number;
  /** Minimum ms between any two requests. */
  spacingMs: number;
  desktopNotifications: boolean;
  confirmMutations: boolean;
  /** Longest single jump, in sectors. Longer trips become a series of jumps. */
  maxHop: number;
  set: (patch: Partial<Omit<Settings, 'set' | 'reset'>>) => void;
  reset: () => void;
};

const defaults = {
  accent: 'ion' as Accent,
  reduceMotion: false,
  compact: false,
  pollProbe: 30,
  pollCrew: 30,
  pollFleet: 120,
  pollComms: 90,
  spacingMs: 1200,
  desktopNotifications: true,
  confirmMutations: true,
  maxHop: 1,
};

/** Storage that never throws (private mode, quota, corrupted data). */
const safeStorage = createJSONStorage(() => ({
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
}));

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      ...defaults,
      set: (patch) => set(patch),
      reset: () => set(defaults),
    }),
    {
      name: 'guppi2.settings',
      storage: safeStorage,
      version: 1,
      // Drop anything malformed rather than crashing on start-up.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const out = { ...current };
        for (const [k, v] of Object.entries(defaults)) if (typeof p[k] === typeof v) (out as Record<string, unknown>)[k] = p[k];
        return out;
      },
    },
  ),
);

export { safeStorage };
