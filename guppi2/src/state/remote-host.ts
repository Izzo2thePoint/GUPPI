/**
 * The PC side of the phone remote. The Electron main process receives HTTP calls
 * from a paired phone and forwards them here, so that:
 *  - phone game requests run through this app's single scheduler (one request
 *    lane, one rate-limit clock, the key never leaves the PC);
 *  - the phone can watch and control jobs and outposts that keep running on the PC.
 */
import { parseWire, ValidationError } from '@/core/catalog';
import { GameApiError, StoppedError, UncertainOutcomeError, errorMessage } from '@/core/errors';
import { useSession } from './session';
import { useJobs } from './jobs';
import { useOutposts, type Outpost } from './outposts';
import { outpostJob, pauseOutpost, startOutpost } from './outpost-runner';
import { startMiningRun, startScan, type MiningRunOptions } from './automations';

export type RemoteJob = { id: string; name: string; kind: string; probeId: string; state: string; message: string; progress?: number; startedAt: number; finishedAt?: number };
export type RemoteOutpost = Pick<Outpost, 'id' | 'probeId' | 'name' | 'coord' | 'targetName' | 'resource' | 'total' | 'mined' | 'loads' | 'status' | 'message' | 'mannyIds' | 'updatedAt'> & { running: boolean };
export type RemoteStatus = {
  version: string;
  connected: boolean;
  mode: string | null;
  selectedProbeId: string | null;
  jobs: RemoteJob[];
  outposts: RemoteOutpost[];
  link: { state: string; queued: number; remaining: number | null } | null;
};

export type RemoteAction =
  | { type: 'stop-job'; id: string }
  | { type: 'pause-outpost'; id: string }
  | { type: 'resume-outpost'; id: string }
  | { type: 'mining-run'; probeId: string; options: MiningRunOptions }
  | { type: 'scan'; probeId: string };

export class NotConnected extends Error {
  readonly code = 'not_connected';
  constructor() {
    super('GUPPI on the PC is not connected to the game.');
  }
}

const game = () => {
  const g = useSession.getState().game;
  if (!g) throw new NotConnected();
  return g;
};

const headers = { retryAfter: null, remaining: null, reset: null, limit: null };

/** Run one phone game request through this app's scheduler and answer in wire format. */
async function remoteGame(payload: unknown) {
  let command;
  try {
    command = parseWire(payload as { method: string; path: string; body?: unknown });
  } catch (e) {
    return { status: 400, data: { error: { code: 'invalid_request', message: errorMessage(e) } }, headers };
  }
  try {
    const data = await game().raw(command, { priority: 'user', label: `Phone · ${command.operation.split(' ').slice(1).join(' ')}` });
    return { status: 200, data, headers };
  } catch (e) {
    if (e instanceof NotConnected) throw e;
    if (e instanceof GameApiError) return { status: e.status, data: e.data, headers };
    if (e instanceof ValidationError) return { status: 400, data: { error: { code: 'invalid_request', message: e.message } }, headers };
    // Never let the phone retry something the PC could not confirm.
    if (e instanceof UncertainOutcomeError) return { error: e.message, uncertain: true, notSent: false };
    if (e instanceof StoppedError) return { error: 'Cancelled on the PC.', notSent: true };
    return { error: errorMessage(e), notSent: false };
  }
}

export function remoteStatus(): RemoteStatus {
  const s = useSession.getState();
  const stats = s.game?.scheduler.stats();
  return {
    version: __APP_VERSION__,
    connected: s.status === 'connected' && !!s.game,
    mode: s.mode,
    selectedProbeId: s.selectedProbeId,
    jobs: useJobs
      .getState()
      .jobs.slice(-40)
      .map((j) => ({ id: j.id, name: j.name, kind: j.kind, probeId: j.probeId, state: j.state, message: j.message, progress: j.progress, startedAt: j.startedAt, finishedAt: j.finishedAt })),
    outposts: useOutposts.getState().outposts.map((o) => ({
      id: o.id,
      probeId: o.probeId,
      name: o.name,
      coord: o.coord,
      targetName: o.targetName,
      resource: o.resource,
      total: o.total,
      mined: o.mined,
      loads: o.loads,
      status: o.status,
      message: o.message,
      mannyIds: o.mannyIds,
      updatedAt: o.updatedAt,
      running: !!outpostJob(o.id),
    })),
    link: stats ? { state: stats.link, queued: stats.queued, remaining: stats.remaining } : null,
  };
}

async function remoteAction(a: RemoteAction) {
  switch (a?.type) {
    case 'stop-job': {
      const job = useJobs.getState().jobs.find((j) => j.id === a.id);
      if (!job) throw new Error('No such job.');
      // An outpost job is paused (so it does not auto-resume) rather than just stopped.
      if (job.kind.startsWith('outpost:')) pauseOutpost(job.kind.slice(8));
      else job.controller.abort();
      return { ok: true };
    }
    case 'pause-outpost':
      pauseOutpost(a.id);
      return { ok: true };
    case 'resume-outpost':
      return { ok: true, jobId: startOutpost(game(), a.id).id };
    case 'mining-run':
      return { ok: true, jobId: startMiningRun(game(), a.probeId, a.options).id };
    case 'scan': {
      const p = await game().probe(a.probeId, { priority: 'user' });
      if (!p.sector) throw new Error('The probe position is unknown.');
      return { ok: true, jobId: startScan(game(), a.probeId, p.sector).id };
    }
    default:
      throw new Error('Unknown remote action.');
  }
}

export async function handleRemoteCall(kind: string, payload: unknown): Promise<unknown> {
  if (kind === 'status') return remoteStatus();
  if (kind === 'game') return remoteGame(payload);
  if (kind === 'action') return remoteAction(payload as RemoteAction);
  throw new Error('Unknown remote call.');
}

/** Wire the handler to the desktop bridge (no-op in browser builds). */
export function installRemoteHost() {
  const bridge = window.guppi?.remote;
  if (!bridge) return () => undefined;
  return bridge.onCall(async (id, kind, payload) => {
    try {
      bridge.reply(id, { ok: true, value: await handleRemoteCall(kind, payload) });
    } catch (e) {
      bridge.reply(id, { ok: false, error: errorMessage(e), code: e instanceof NotConnected ? 'not_connected' : undefined });
    }
  });
}
