import { create } from 'zustand';
import { createGame, type Game } from '@/core/game';
import { Scheduler, type ActivityEntry } from '@/core/scheduler';
import { desktopTransport, proxyTransport, type Transport } from '@/core/transport';
import { createSimulator } from '@/core/simulator/world';
import { queryClient } from './query';
import { useJobs } from './jobs';
import { useSettings } from './settings';

export type Mode = 'desktop' | 'proxy' | 'simulator';

type SessionState = {
  status: 'disconnected' | 'connecting' | 'connected';
  mode: Mode | null;
  game: Game | null;
  error: string | null;
  selectedProbeId: string | null;
  activity: ActivityEntry[];
  connect: (mode: Mode, key: string, remember?: boolean) => Promise<void>;
  resume: () => Promise<boolean>;
  disconnect: (forget?: boolean) => Promise<void>;
  selectProbe: (id: string) => void;
};

export const isDesktop = () => typeof window !== 'undefined' && !!window.guppi;

let pageKey = '';

function transportFor(mode: Mode): Transport {
  if (mode === 'desktop') return desktopTransport();
  if (mode === 'proxy') return proxyTransport(() => pageKey);
  return createSimulator();
}

const LAST_PROBE = 'guppi2.lastProbe';

export const useSession = create<SessionState>((set, get) => {
  async function start(mode: Mode) {
    const scheduler = new Scheduler(transportFor(mode), { spacingMs: mode === 'simulator' ? 250 : useSettings.getState().spacingMs });
    scheduler.onActivity((entry) =>
      set((s) => {
        const i = s.activity.findIndex((a) => a.id === entry.id);
        const next = i >= 0 ? s.activity.map((a, j) => (j === i ? entry : a)) : [entry, ...s.activity];
        return { activity: next.slice(0, 500) };
      }),
    );
    const game = createGame(scheduler);
    // Validate the key with a cheap, authenticated read before entering the app.
    const probes = await game.probes({ priority: 'user' });
    if (!probes.length) throw new Error('No probes were returned for this key.');
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_PROBE);
    } catch {
      /* ignore */
    }
    const selected = probes.find((p) => p.id === last)?.id ?? probes.find((p) => p.isDefault)?.id ?? probes[0].id;
    queryClient.setQueryData(['probes'], probes);
    set({ status: 'connected', mode, game, error: null, selectedProbeId: selected });
  }

  return {
    status: 'disconnected',
    mode: null,
    game: null,
    error: null,
    selectedProbeId: null,
    activity: [],

    async connect(mode, key, remember = false) {
      set({ status: 'connecting', error: null });
      try {
        if (mode === 'desktop') {
          const r = await window.guppi!.auth.connect(key, remember);
          if (!r.ok) throw new Error(r.error);
        } else if (mode === 'proxy') pageKey = key.trim();
        await start(mode);
      } catch (e) {
        if (mode === 'desktop') await window.guppi?.auth.disconnect(false);
        pageKey = '';
        set({ status: 'disconnected', game: null, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
    },

    /** Reconnect with a key remembered by the desktop shell (encrypted by the OS). */
    async resume() {
      if (!isDesktop()) return false;
      const r = await window.guppi!.auth.status();
      if (!r.connected) return false;
      set({ status: 'connecting' });
      try {
        await start('desktop');
        return true;
      } catch (e) {
        set({ status: 'disconnected', error: e instanceof Error ? e.message : String(e) });
        return false;
      }
    },

    async disconnect(forget = false) {
      useJobs.getState().stopAll();
      get().game?.scheduler.clear();
      if (get().mode === 'desktop') await window.guppi?.auth.disconnect(forget);
      pageKey = '';
      queryClient.clear();
      set({ status: 'disconnected', game: null, mode: null, selectedProbeId: null, activity: [] });
    },

    selectProbe(id) {
      try {
        localStorage.setItem(LAST_PROBE, id);
      } catch {
        /* ignore */
      }
      set({ selectedProbeId: id });
    },
  };
});

/** Non-null accessor for components rendered only while connected. */
export function useGame(): Game {
  const game = useSession((s) => s.game);
  if (!game) throw new Error('Not connected');
  return game;
}

export function useProbeId(): string {
  const id = useSession((s) => s.selectedProbeId);
  if (!id) throw new Error('No probe selected');
  return id;
}
