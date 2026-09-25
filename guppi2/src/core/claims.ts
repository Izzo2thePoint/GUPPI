/**
 * Resource claims keep concurrent automations from fighting over the same Manny,
 * container, asteroid or the probe itself. A job must hold its claims before it
 * sends orders; conflicting jobs wait (or fail fast when started by hand).
 */
export type Claim = { key: string; shared?: boolean };

/**
 * `probe` is a whole-probe lock; `helm` guards movement only, so Mannies can keep
 * working aboard while a voyage is underway (the game rejects anything unsafe).
 */
export const overlaps = (a: Claim, b: Claim) => a.key === 'probe' || b.key === 'probe' || (a.key === b.key && !(a.shared && b.shared));

type Body = Record<string, unknown> | undefined;

/** Derive the claims a single command needs from its operation, params and body. */
export function claimsFor(operation: string, params: Record<string, unknown> = {}, body?: unknown): Claim[] {
  if (operation.startsWith('GET ') || /\/(messages|alerts|damage-warnings|logbook)/.test(operation)) return [];
  const b = body as Body;
  if (operation.endsWith('/move')) return [{ key: 'helm' }];
  const claims: Claim[] = [];
  const push = (key: string, shared = false) => claims.push({ key, shared });
  const ids = [params.mannyId, b?.mannyId, b?.actorMannyId, b?.targetMannyId, ...((b?.targetMannyIds as unknown[]) ?? [])];
  for (const t of (b?.tasks as { mannyId?: string }[]) ?? []) ids.push(t.mannyId);
  for (const m of ids) if (m) push(`manny:${m}`);
  if (operation.includes('/atomic-printer/')) push('printer');
  if (operation.endsWith('/repair')) push('integrity');
  if (operation.endsWith('/jettison') && params.itemId) push(`item:${params.itemId}`);
  if (/\/(mine)$/.test(operation) && b?.objectId) push(`asteroid:${b.objectId}`, true);
  if (/\/(motorize-asteroid|refuel-motorized-asteroid|sculpt-duck-asteroid|salvage|inspect-sector-object)$/.test(operation) && b?.objectId)
    push(`object:${b.objectId}`);
  if (params.asteroidId) push(`object:${params.asteroidId}`);
  if (operation.endsWith('/storage-moves')) {
    for (const c of [b?.fromContainerId, b?.toContainerId]) if (c) push(`container:${c}`, true);
  }
  if (params.containerId && !operation.startsWith('GET ')) push(`container:${params.containerId}`);
  return claims;
}

export type JobState = 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'stopped';

export type Job = {
  id: string;
  name: string;
  kind: string;
  probeId: string;
  state: JobState;
  message: string;
  progress?: number;
  startedAt: number;
  finishedAt?: number;
  claims: Claim[];
  controller: AbortController;
  log: { at: number; text: string; tone?: 'ok' | 'warn' | 'error' }[];
};

export class ClaimConflict extends Error {
  constructor(readonly holder: Job) {
    super(`Busy: “${holder.name}” is using the same Manny, equipment or target.`);
    this.name = 'ClaimConflict';
  }
}

export function conflictWith(jobs: Iterable<Job>, probeId: string, claims: Claim[], self?: Job) {
  if (!claims.length) return undefined;
  for (const j of jobs)
    if (j !== self && j.probeId === probeId && (j.state === 'running' || j.state === 'waiting') && j.claims.some((a) => claims.some((b) => overlaps(a, b))))
      return j;
  return undefined;
}
