import { create } from 'zustand';
import type { Coord } from '@/core/models';

export type View =
  | 'bridge'
  | 'fleet'
  | 'navigation'
  | 'tactical'
  | 'scut'
  | 'outposts'
  | 'crew'
  | 'inventory'
  | 'workshop'
  | 'automation'
  | 'comms'
  | 'logbook'
  | 'console'
  | 'activity'
  | 'settings';

const VIEWS: View[] = ['bridge', 'fleet', 'navigation', 'tactical', 'scut', 'outposts', 'crew', 'inventory', 'workshop', 'automation', 'comms', 'logbook', 'console', 'activity', 'settings'];

function fromHash(): View {
  const h = typeof location !== 'undefined' ? location.hash.replace(/^#\/?/, '') : '';
  return (VIEWS as string[]).includes(h) ? (h as View) : 'bridge';
}

type NavState = {
  view: View;
  palette: boolean;
  jobs: boolean;
  /** Pre-selected operation for the API console. */
  consoleOp: string | null;
  /** A sector Navigation should target and fly to when it opens (Fleet → Locate). */
  mapTarget: Coord | null;
  go: (v: View) => void;
  setPalette: (v: boolean) => void;
  setJobs: (v: boolean) => void;
  openConsole: (op: string) => void;
  locate: (c: Coord) => void;
};

export const useNav = create<NavState>((set) => ({
  view: fromHash(),
  palette: false,
  jobs: false,
  consoleOp: null,
  mapTarget: null,
  go: (view) => {
    if (typeof history !== 'undefined') history.replaceState(null, '', `#/${view}`);
    set({ view, palette: false });
  },
  setPalette: (palette) => set({ palette }),
  setJobs: (jobs) => set({ jobs }),
  openConsole: (consoleOp) => {
    history.replaceState(null, '', '#/console');
    set({ view: 'console', consoleOp, palette: false });
  },
  locate: (mapTarget) => {
    history.replaceState(null, '', '#/navigation');
    set({ view: 'navigation', mapTarget, palette: false });
  },
}));

if (typeof window !== 'undefined') window.addEventListener('hashchange', () => useNav.setState({ view: fromHash() }));
