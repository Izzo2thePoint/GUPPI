/**
 * GUPPI Mobile connection handling: how the phone reaches either GUPPI on the
 * player's PC (remote) or the game itself (direct), plus the PC remote client
 * for jobs and outposts that run on the PC.
 */
import { useQuery } from '@tanstack/react-query';
import { GAME_ORIGIN } from '@/core/transport';
import { useSession } from '@/state/session';
import { startMiningRun, startScan, type MiningRunOptions } from '@/state/automations';
import { useGame } from '@/state/session';
import { useJobs } from '@/state/jobs';
import type { RemoteAction, RemoteStatus } from '@/state/remote-host';

export type SavedConnection = { mode: 'remote' | 'direct'; base: string; secret: string };

const KEY = 'guppi2.mobile.connection';
let current: SavedConnection | null = null;

export function savedConnection(): SavedConnection | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && (v.mode === 'remote' || v.mode === 'direct') && typeof v.base === 'string' && typeof v.secret === 'string') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function forgetConnection() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Pairing links look like http://pc:47811/#pair=TOKEN. Read and scrub the token. */
export function takePairingToken(): string | null {
  const m = location.hash.match(/pair=([A-Za-z0-9_-]{16,})/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return m[1];
}

/** Served by a PC (http on a LAN/Tailscale address) rather than by a hosted https site? */
export const servedByPc = () => location.protocol === 'http:' && !/github\.io$/.test(location.hostname);

/**
 * Is this page hosted by the GUPPI relay (relay/ in the repo)? Then the site
 * itself relays game calls, same-origin, with no CORS to worry about.
 */
export async function detectHostedRelay(): Promise<boolean> {
  if (location.protocol !== 'https:') return false;
  try {
    const res = await fetch('./relay-info', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return false;
    return ((await res.json()) as { guppiRelay?: unknown }).guppiRelay === 1;
  } catch {
    return false;
  }
}

export async function connectMobile(conn: SavedConnection | { mode: 'simulator' }, remember: boolean) {
  const session = useSession.getState();
  if (conn.mode === 'simulator') {
    current = null;
    return session.connect('simulator', '');
  }
  current = conn;
  await session.connect(conn.mode, conn.secret, false, { base: conn.base });
  if (remember)
    try {
      localStorage.setItem(KEY, JSON.stringify(conn));
    } catch {
      /* ignore */
    }
}

export const defaultDirectBase = GAME_ORIGIN;

// ── PC remote API (jobs, outposts, automations) ──────────────────────────────

async function pc<T>(path: string, init?: RequestInit): Promise<T> {
  if (!current || current.mode !== 'remote') throw new Error('Not connected to a PC.');
  const res = await fetch(`${current.base.replace(/\/+$/, '')}/remote/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${current.secret}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as T & { error?: string };
  if (!res.ok || (body && typeof body === 'object' && 'error' in body && body.error)) throw new Error(body?.error ?? `PC returned HTTP ${res.status}`);
  return body;
}

export function useRemoteStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['pc-status'],
    queryFn: () => pc<RemoteStatus>('status'),
    enabled,
    refetchInterval: 5000,
    retry: 1,
  });
}

export const remoteAction = (action: RemoteAction) => pc<{ ok: boolean; jobId?: string }>('action', { method: 'POST', body: JSON.stringify(action) });

/**
 * Start automations where they belong: on the PC in remote mode (so they keep
 * running when the phone sleeps), on the phone otherwise.
 */
export function useRunner() {
  const mode = useSession((s) => s.mode);
  const game = useGame();
  const onPc = mode === 'remote';
  return {
    onPc,
    miningRun: async (probeId: string, options: MiningRunOptions) => {
      if (onPc) return remoteAction({ type: 'mining-run', probeId, options });
      return startMiningRun(game, probeId, options);
    },
    scan: async (probeId: string) => {
      if (onPc) return remoteAction({ type: 'scan', probeId });
      const p = await game.probe(probeId, { priority: 'user' });
      if (!p.sector) throw new Error('Probe position unknown.');
      return startScan(game, probeId, p.sector);
    },
    stopJob: async (id: string) => {
      if (onPc) return remoteAction({ type: 'stop-job', id });
      useJobs.getState().stop(id);
    },
  };
}
