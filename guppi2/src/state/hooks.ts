import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GameApiError, UncertainOutcomeError, errorMessage } from '@/core/errors';
import { isMoving, isReachable } from '@/core/models';
import { claimsFor, conflictWith } from '@/core/claims';
import { useGame, useSession } from './session';
import { queryClient } from './query';
import { useSettings } from './settings';
import { useJobs } from './jobs';

export const keys = {
  probes: ['probes'] as const,
  probe: (id: string) => ['probe', id] as const,
  mannies: (id: string) => ['mannies', id] as const,
  sector: (id: string) => ['sector', id] as const,
  visited: (id?: string) => ['visited', id ?? 'all'] as const,
  recipes: ['recipes'] as const,
  improvements: (id: string) => ['improvements', id] as const,
  messages: (id: string, offset: number, unread: boolean) => ['messages', id, offset, unread] as const,
  alerts: (id: string) => ['alerts', id] as const,
  damage: (id: string) => ['damage', id] as const,
  logbook: (id: string) => ['logbook', id] as const,
  page: (id: string, page: string) => ['page', id, page] as const,
};

const sec = (s: number) => Math.max(5, s) * 1000;

/**
 * First loads are what the user is waiting on, so they go at user priority;
 * later refreshes ride in the background lane.
 */
export function opt(signal: AbortSignal, queryKey: QueryKey) {
  const loaded = queryClient.getQueryState(queryKey)?.data !== undefined;
  return { signal, priority: loaded ? ('background' as const) : ('user' as const) };
}

export function useProbes() {
  const game = useGame();
  const poll = useSettings((s) => s.pollFleet);
  return useQuery({ queryKey: keys.probes, queryFn: ({ signal, queryKey }) => game.probes(opt(signal, queryKey)), refetchInterval: sec(poll) });
}

export function useProbe(id: string) {
  const game = useGame();
  const poll = useSettings((s) => s.pollProbe);
  return useQuery({
    queryKey: keys.probe(id),
    queryFn: ({ signal, queryKey }) => game.probe(id, opt(signal, queryKey)),
    // Poll faster while a jump is underway so arrival is picked up promptly.
    refetchInterval: (q) => sec(isMoving(q.state.data) ? Math.min(poll, 15) : poll),
  });
}

export function useMannies(id: string, enabled = true) {
  const game = useGame();
  const poll = useSettings((s) => s.pollCrew);
  return useQuery({
    queryKey: keys.mannies(id),
    queryFn: ({ signal, queryKey }) => game.mannies(id, opt(signal, queryKey)),
    enabled,
    refetchInterval: (q) => sec(q.state.data?.some((m) => m.currentTask) ? Math.min(poll, 20) : poll),
  });
}

export function useSector(id: string) {
  const game = useGame();
  const probe = useProbe(id);
  const poll = useSettings((s) => s.pollProbe);
  const moving = isMoving(probe.data);
  return useQuery({
    queryKey: keys.sector(id),
    queryFn: ({ signal, queryKey }) => game.sector(id, opt(signal, queryKey)),
    enabled: !!probe.data && !moving && isReachable(probe.data),
    refetchInterval: sec(poll * 4),
    retry: (n, e) => !(e instanceof GameApiError) && n < 1,
  });
}

export function useVisited(id?: string) {
  const game = useGame();
  return useQuery({ queryKey: keys.visited(id), queryFn: ({ signal, queryKey }) => game.visited(id, opt(signal, queryKey)), staleTime: 5 * 60_000, refetchInterval: 10 * 60_000 });
}

export function useRecipes() {
  const game = useGame();
  return useQuery({ queryKey: keys.recipes, queryFn: ({ signal, queryKey }) => game.recipes(opt(signal, queryKey)), staleTime: 60 * 60_000 });
}

export function useImprovements(id: string) {
  const game = useGame();
  return useQuery({ queryKey: keys.improvements(id), queryFn: ({ signal, queryKey }) => game.improvements(id, opt(signal, queryKey)), staleTime: 5 * 60_000 });
}

export function useMessages(id: string, offset = 0, unread = false) {
  const game = useGame();
  const poll = useSettings((s) => s.pollComms);
  return useQuery({
    queryKey: keys.messages(id, offset, unread),
    queryFn: ({ signal, queryKey }) => game.messages(id, { offset, unread, limit: 25 }, opt(signal, queryKey)),
    refetchInterval: sec(poll),
  });
}

export function useAlerts(id: string) {
  const game = useGame();
  const poll = useSettings((s) => s.pollComms);
  return useQuery({ queryKey: keys.alerts(id), queryFn: ({ signal, queryKey }) => game.alerts(id, false, opt(signal, queryKey)), refetchInterval: sec(poll) });
}

export function useDamage(id: string) {
  const game = useGame();
  const poll = useSettings((s) => s.pollComms);
  return useQuery({ queryKey: keys.damage(id), queryFn: ({ signal, queryKey }) => game.damageWarnings(id, opt(signal, queryKey)), refetchInterval: sec(poll * 2) });
}

export function useLogbook(id: string) {
  const game = useGame();
  return useQuery({ queryKey: keys.logbook(id), queryFn: ({ signal, queryKey }) => game.logbook(id, {}, opt(signal, queryKey)), staleTime: 60_000 });
}

/** Live clock for countdowns. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function describeError(e: unknown) {
  if (e instanceof UncertainOutcomeError && e.mutation) return { title: 'Outcome unknown', body: e.message };
  if (e instanceof GameApiError) return { title: e.code ? e.code.replaceAll('_', ' ') : `Game refused (${e.status})`, body: e.message };
  return { title: 'Action failed', body: errorMessage(e) };
}

type ActionOptions<T> = {
  /** Toast shown while pending and on success. */
  label: string;
  success?: string | ((r: T) => string);
  invalidate?: QueryKey[];
  /** Claims checked against running automations before sending. */
  claim?: { operation: string; params?: Record<string, unknown>; body?: unknown; probeId: string };
};

/**
 * A user-initiated mutation: refuses to collide with running automations,
 * shows a toast lifecycle, and refreshes affected data afterwards.
 */
export function useAction<V, T = unknown>(fn: (v: V) => Promise<T>, options: ActionOptions<T> | ((v: V) => ActionOptions<T>)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: V) => {
      const o = typeof options === 'function' ? options(v) : options;
      if (o.claim) {
        const holder = conflictWith(useJobs.getState().jobs, o.claim.probeId, claimsFor(o.claim.operation, o.claim.params, o.claim.body));
        if (holder) throw new Error(`“${holder.name}” is already using this Manny or target. Stop that job first.`);
      }
      const id = toast.loading(o.label);
      try {
        const r = await fn(v);
        const msg = typeof o.success === 'function' ? o.success(r) : (o.success ?? `${o.label.replace(/…$/, '')} — done`);
        toast.success(msg, { id });
        return r;
      } catch (e) {
        const d = describeError(e);
        toast.error(d.title, { id, description: d.body, duration: 8000 });
        throw e;
      } finally {
        for (const k of o.invalidate ?? []) void qc.invalidateQueries({ queryKey: k });
      }
    },
  });
}

export function useSelectedProbeId() {
  return useSession((s) => s.selectedProbeId)!;
}
