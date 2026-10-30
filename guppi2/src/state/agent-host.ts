/**
 * The PC side of the Agent API (`/api/v1/*`). The Electron main process checks
 * the token and scope, then forwards each call here. Everything runs through the
 * app's own game façade and scheduler at automation priority, below the
 * player's own clicks, and every call is labelled with the agent's name in the
 * Activity log.
 */
import { parseWire, isRead, ValidationError } from '@/core/catalog';
import { GameApiError, StoppedError, UncertainOutcomeError, errorMessage } from '@/core/errors';
import { AGENT_ACTIONS, AGENT_READS, AgentError, DANGEROUS_OPERATIONS, actionVerb, openapiSpec, validate, type Scope } from '@/core/agent-api';
import { allBodies, contacts, detachedContainers, hasRefuelStation, isMoving, isReachable, mannyReady, miningTargets, missiles, scutRelays, type Coord, type Probe, type Sector } from '@/core/models';
import { hops, isValidSector, planLegs } from '@/core/lattice';
import type { RequestOptions } from '@/core/scheduler';
import { useSession } from './session';
import { useJobs } from './jobs';
import { useSettings } from './settings';
import { summarize, useArchive } from './archive';
import { useOutposts } from './outposts';
import { outpostJob, pauseOutpost, startOutpost } from './outpost-runner';
import { startCraftQueue, startMiningRun, startScan, startVoyage } from './automations';
import { remoteStatus, NotConnected } from './remote-host';
import { queryClient } from './query';
import { keys } from './hooks';

export type AgentRequest = { method: string; path: string; query?: Record<string, string>; body?: unknown; scope: Scope; allowDangerous: boolean; client?: string; serverUrl?: string };
export type AgentResponse = { status: number; body: unknown };

const game = () => {
  const g = useSession.getState().game;
  if (!g) throw new NotConnected();
  return g;
};

/** Drop the `raw` game payloads unless the agent asked for them: half the bytes, same facts. */
function strip(value: unknown, keepRaw: boolean): unknown {
  if (keepRaw) return value;
  return JSON.parse(JSON.stringify(value, (k, v) => (k === 'raw' ? undefined : v)));
}

export function sectorView(sector: Sector | undefined, probeId: string, ownIds: string[]) {
  if (!sector) return null;
  const bodies = allBodies(sector).map((o) => ({
    id: o.id,
    type: o.type,
    name: o.name,
    role: o.role,
    resourceTypes: o.resourceTypes?.length ? o.resourceTypes : undefined,
    resourceAmounts: o.resourceAmounts,
    mannyMineable: o.mannyMineable,
    estimated: o.estimated,
    inTransit: o.inTransit,
    inspectable: o.inspectable,
    salvageable: o.salvageable,
    raw: o.raw,
  }));
  return {
    coord: sector.coord,
    knowledgeLevel: sector.knowledgeLevel,
    dataFreshness: sector.dataFreshness,
    scutCoverage: sector.scutCoverage,
    scutNetworks: sector.scutNetworks,
    navigationalRisk: sector.navigationalRisk,
    summary: sector.coord ? summarize(sector.coord, sector) : undefined,
    probes: sector.probes,
    bodies,
    mineable: miningTargets(sector),
    relays: scutRelays(sector).map((r) => ({ id: r.id, name: r.name, status: r.raw.status })),
    detachedContainers: detachedContainers(sector).map((c) => ({ id: c.id, name: c.name })),
    refuelStation: hasRefuelStation(sector),
    contacts: contacts(sector, probeId, ownIds),
    missiles: missiles(sector, probeId),
  };
}

async function fleet(o: RequestOptions): Promise<Probe[]> {
  const g = game();
  const list = await g.probes(o);
  return Promise.all(list.map(async (p) => (isReachable(p) ? { ...p, ...(await g.probe(p.id, o).catch(() => ({}))) } : p)));
}

async function sectorOf(probeId: string, ownIds: string[], o: RequestOptions) {
  try {
    const { sector } = await game().sector(probeId, o);
    return { sector: sectorView(sector, probeId, ownIds), sectorError: null };
  } catch (e) {
    if (e instanceof GameApiError) return { sector: null, sectorError: { code: e.code, message: e.message } };
    throw e;
  }
}

async function read(path: string, query: Record<string, string>, o: RequestOptions, req: AgentRequest): Promise<unknown> {
  const raw = query.raw === '1' || query.raw === 'true';
  const s = useSession.getState();
  const m = (re: RegExp) => path.match(re);
  let mm: RegExpMatchArray | null;

  if (path === '/api/v1/openapi.json') return openapiSpec(__APP_VERSION__, req.serverUrl);
  if (path === '/api/v1/verbs') return { reads: AGENT_READS, actions: AGENT_ACTIONS, dangerousOperations: DANGEROUS_OPERATIONS };
  if (path === '/api/v1/status') return { ...remoteStatus(), scope: req.scope, dangerousAllowed: req.allowDangerous };
  if (path === '/api/v1/state') {
    const probeId = query.probe || s.selectedProbeId;
    if (!probeId) throw new AgentError(409, 'no_probe', 'No probe is selected. Pass ?probe=<id>.');
    const probes = await fleet(o);
    const own = probes.map((p) => p.id);
    const probe = probes.find((p) => p.id === probeId) ?? (await game().probe(probeId, o));
    const [crew, { sector, sectorError }, alerts] = await Promise.all([game().mannies(probeId, o).catch(() => []), isMoving(probe) ? { sector: null, sectorError: { code: 'sensors_unavailable', message: 'The probe is moving.' } } : sectorOf(probeId, own, o), game().alerts(probeId, true, o).catch(() => [])]);
    const st = remoteStatus();
    return strip(
      {
        version: st.version,
        connected: st.connected,
        mode: st.mode,
        selectedProbeId: s.selectedProbeId,
        settings: { maxHop: useSettings.getState().maxHop },
        probes: probes.map((p) => ({ ...p, inventory: undefined })),
        probe,
        crew,
        sector,
        sectorError,
        jobs: st.jobs,
        outposts: st.outposts,
        alerts,
        link: st.link,
      },
      raw,
    );
  }
  if (path === '/api/v1/probes') return strip(await fleet(o), raw);
  if ((mm = m(/^\/api\/v1\/probes\/([^/]+)$/))) {
    const id = decodeURIComponent(mm[1]);
    const [probe, crew] = await Promise.all([game().probe(id, o), game().mannies(id, o).catch(() => [])]);
    return strip({ ...probe, crew }, raw);
  }
  if ((mm = m(/^\/api\/v1\/probes\/([^/]+)\/sector$/))) {
    const id = decodeURIComponent(mm[1]);
    const own = (await game().probes(o)).map((p) => p.id);
    const r = await sectorOf(id, own, o);
    if (r.sectorError) throw new AgentError(409, r.sectorError.code ?? 'sensors_unavailable', r.sectorError.message);
    return strip(r.sector, raw);
  }
  if ((mm = m(/^\/api\/v1\/probes\/([^/]+)\/crew$/))) return strip(await game().mannies(decodeURIComponent(mm[1]), o), raw);
  if ((mm = m(/^\/api\/v1\/probes\/([^/]+)\/alerts$/))) return strip(await game().alerts(decodeURIComponent(mm[1]), query.unread === '1' || query.unread === 'true', o), raw);
  if (path === '/api/v1/archive') {
    const a = useArchive.getState();
    return { sectors: Object.values(a.sectors), bookmarks: Object.values(a.bookmarks) };
  }
  if (path === '/api/v1/jobs') return remoteStatus().jobs;
  if ((mm = m(/^\/api\/v1\/jobs\/([^/]+)$/))) {
    const j = useJobs.getState().jobs.find((x) => x.id === mm![1]);
    if (!j) throw new AgentError(404, 'not_found', 'No such job.');
    return { id: j.id, name: j.name, kind: j.kind, probeId: j.probeId, state: j.state, message: j.message, progress: j.progress, startedAt: j.startedAt, finishedAt: j.finishedAt, claims: j.claims.map((c) => c.key), log: j.log };
  }
  if (path === '/api/v1/outposts') return remoteStatus().outposts;
  if (path === '/api/v1/recipes') return strip(await game().recipes(o), raw);
  throw new AgentError(404, 'not_found', `Unknown endpoint ${path}. GET /api/v1/openapi.json lists them.`);
}

const coordOf = (v: unknown): Coord => {
  const c = v as Coord;
  if (!c || ![c.x, c.y, c.z].every(Number.isInteger) || !isValidSector(c)) throw new AgentError(400, 'invalid_params', 'target must be a sector with integer x, y, z and x + y + z even.');
  return { x: c.x, y: c.y, z: c.z };
};

async function action(name: string, body: Record<string, unknown>, o: RequestOptions, req: AgentRequest): Promise<unknown> {
  const verb = actionVerb(name);
  if (!verb) throw new AgentError(404, 'not_found', `Unknown action ${name}. GET /api/v1/verbs lists them.`);
  validate(verb.params, body ?? {});
  if (verb.dangerous && !req.allowDangerous) throw new AgentError(403, 'dangerous_disabled', `${name} is a dangerous action. In GUPPI, turn on Settings → Phone & agent access → Allow dangerous actions.`);
  const g = game();
  const probeId = String(body.probeId ?? '');
  switch (name) {
    case 'select-probe':
      useSession.getState().selectProbe(probeId);
      return { ok: true, selectedProbeId: probeId };
    case 'jump': {
      const target = coordOf(body.target);
      const p = await g.probe(probeId, o);
      if (!p.sector) throw new AgentError(409, 'position_unknown', 'The probe position is unknown.');
      if (isMoving(p)) throw new AgentError(409, 'already_moving', 'The probe is already moving.');
      const maxHop = useSettings.getState().maxHop;
      const legs = planLegs(p.sector, target, maxHop);
      if (!legs.length) throw new AgentError(409, 'same_sector', 'The probe is already there.');
      if (body.mode === 'voyage' || legs.length > 1) {
        const job = startVoyage(g, probeId, p.name, [target], { scanOnArrival: body.scanOnArrival === true, minDeuterium: typeof body.reserve === 'number' ? body.reserve : 0 });
        return { ok: true, jobId: job.id, jumps: legs.length, hops: hops(p.sector, target), legs };
      }
      const r = await g.move(probeId, target, o);
      void queryClient.invalidateQueries({ queryKey: keys.probe(probeId) });
      return { ok: true, jumps: 1, hops: hops(p.sector, target), movement: r };
    }
    case 'scan': {
      const p = await g.probe(probeId, o);
      if (!p.sector) throw new AgentError(409, 'position_unknown', 'The probe position is unknown.');
      return { ok: true, jobId: startScan(g, probeId, p.sector).id };
    }
    case 'mine': {
      const { sector } = await g.sector(probeId, o);
      const target = miningTargets(sector).find((t) => t.id === String(body.objectId));
      if (!target) throw new AgentError(422, 'not_mineable', `${String(body.objectId)} is not a mineable body in the probe's sector.`);
      const resources = Array.isArray(body.resources) && body.resources.length ? (body.resources as string[]) : target.resourceTypes;
      const bad = resources.filter((r) => !target.resourceTypes.includes(r));
      if (bad.length) throw new AgentError(422, 'resource_unavailable', `${target.name} does not offer ${bad.join(', ')}. It offers ${target.resourceTypes.join(', ')}.`);
      const crew = await g.mannies(probeId, o);
      const mannyIds = Array.isArray(body.mannyIds) && body.mannyIds.length ? (body.mannyIds as string[]) : crew.filter(mannyReady).map((m) => m.id);
      if (!mannyIds.length) throw new AgentError(409, 'no_manny', 'No Manny is ready aboard.');
      const job = startMiningRun(g, probeId, {
        mannyIds,
        objectId: target.id,
        objectName: target.name,
        resources,
        total: Number(body.amount),
        targetContainerId: typeof body.containerId === 'string' ? body.containerId : undefined,
        stopWhenFreeBelow: 0,
      });
      return { ok: true, jobId: job.id, mannyIds, resources };
    }
    case 'craft': {
      const recipes = await g.recipes(o);
      const recipe = recipes.find((r) => r.id === String(body.recipe));
      if (!recipe) throw new AgentError(422, 'unknown_recipe', `No recipe ${String(body.recipe)}. GET /api/v1/recipes lists them.`);
      const printer = !recipe.craftableBy.includes('manny');
      const job = startCraftQueue(g, probeId, { recipeId: recipe.id, recipeName: recipe.name, count: typeof body.count === 'number' ? body.count : 1, printer, mannyIds: Array.isArray(body.mannyIds) ? (body.mannyIds as string[]) : undefined, waitForCompletion: true });
      return { ok: true, jobId: job.id, printer };
    }
    case 'order': {
      const act = String(body.action).replace(/^\/+|\/+$/g, '');
      if (!/^[a-z0-9_-]+$/i.test(act)) throw new AgentError(400, 'invalid_params', 'action must be an order name like salvage.');
      if (DANGEROUS_OPERATIONS.some((d) => act.includes(d)) && !req.allowDangerous) throw new AgentError(403, 'dangerous_disabled', `${act} is a dangerous order. Turn on Settings → Phone & agent access → Allow dangerous actions.`);
      return { ok: true, result: await g.mannyAction(probeId, String(body.mannyId), act, body.body, o) };
    }
    case 'recall':
      return { ok: true, result: await g.mannyAction(probeId, String(body.mannyId), 'recall', undefined, o) };
    case 'fire': {
      let mannyId = typeof body.mannyId === 'string' ? body.mannyId : undefined;
      if (!mannyId) {
        const crew = await g.mannies(probeId, o);
        mannyId = crew.find(mannyReady)?.id;
        if (!mannyId) throw new AgentError(409, 'no_manny', 'No Manny is ready aboard to prepare the missile.');
      }
      const result = await g.igniteMissile(probeId, mannyId, { targetId: String(body.targetId), ...(typeof body.missileItemId === 'string' ? { missileItemId: body.missileItemId } : {}) }, o);
      void queryClient.invalidateQueries({ queryKey: keys.mannies(probeId) });
      return { ok: true, mannyId, result };
    }
    case 'stop-job': {
      const job = useJobs.getState().jobs.find((j) => j.id === String(body.id));
      if (!job) throw new AgentError(404, 'not_found', 'No such job.');
      if (job.kind.startsWith('outpost:')) pauseOutpost(job.kind.slice(8));
      else job.controller.abort();
      return { ok: true };
    }
    case 'outpost-pause':
      if (!useOutposts.getState().outposts.some((x) => x.id === String(body.id))) throw new AgentError(404, 'not_found', 'No such outpost.');
      pauseOutpost(String(body.id));
      return { ok: true };
    case 'outpost-resume':
      if (!useOutposts.getState().outposts.some((x) => x.id === String(body.id))) throw new AgentError(404, 'not_found', 'No such outpost.');
      return { ok: true, jobId: startOutpost(g, String(body.id)).id, running: !!outpostJob(String(body.id)) };
    case 'bookmark': {
      const c = coordOf(body.target);
      useArchive.getState().bookmark(c, String(body.name), typeof body.note === 'string' ? body.note : undefined);
      return { ok: true };
    }
    default:
      throw new AgentError(501, 'not_implemented', `${name} is listed but not implemented.`);
  }
}

/** Any documented game request, with the same rules as the phone, plus scope and danger checks. */
async function passthrough(body: unknown, o: RequestOptions, req: AgentRequest) {
  let command;
  try {
    command = parseWire(body as { method: string; path: string; body?: unknown });
  } catch (e) {
    throw new AgentError(400, 'invalid_request', errorMessage(e));
  }
  if (!isRead(command.operation) && req.scope !== 'control') throw new AgentError(403, 'read_only', 'This token has read-only scope. In GUPPI, set Settings → Phone & agent access → Agents to Control.');
  if (DANGEROUS_OPERATIONS.some((d) => command.operation.includes(d)) && !req.allowDangerous) throw new AgentError(403, 'dangerous_disabled', `${command.operation} is dangerous. Turn on Settings → Phone & agent access → Allow dangerous actions.`);
  try {
    return { status: 200, data: await game().raw(command, o) };
  } catch (e) {
    if (e instanceof GameApiError) return { status: e.status, data: e.data };
    if (e instanceof ValidationError) throw new AgentError(400, 'invalid_request', e.message);
    if (e instanceof UncertainOutcomeError) return { error: e.message, uncertain: true, notSent: false };
    if (e instanceof StoppedError) return { error: 'Cancelled on the PC.', notSent: true };
    throw e;
  }
}

export async function handleAgentCall(req: AgentRequest): Promise<AgentResponse> {
  const client = (req.client ?? 'agent').replace(/[^\w .-]/g, '').slice(0, 40) || 'agent';
  const query = req.query ?? {};
  const path = req.path.replace(/\/+$/, '') || '/';
  const label = (what: string) => `${client} · ${what}`;
  try {
    if (req.scope === 'off') throw new AgentError(403, 'agents_off', 'Agent access is off. In GUPPI, open Settings → Phone & agent access and set Agents to Read-only or Control.');
    if (req.method === 'GET') return { status: 200, body: await read(path, query, { priority: 'automation', label: label(path.replace('/api/v1/', '')) }, req) };
    if (req.method === 'POST') {
      if (req.scope !== 'control') throw new AgentError(403, 'read_only', 'This token has read-only scope. In GUPPI, set Settings → Phone & agent access → Agents to Control.');
      const m = path.match(/^\/api\/v1\/actions\/([a-z-]+)$/);
      if (m) return { status: 200, body: await action(m[1], (req.body ?? {}) as Record<string, unknown>, { priority: 'automation', label: label(m[1]) }, req) };
      if (path === '/api/v1/game') return { status: 200, body: await passthrough(req.body, { priority: 'automation', label: label('game') }, req) };
      throw new AgentError(404, 'not_found', `Unknown endpoint ${path}.`);
    }
    throw new AgentError(405, 'method_not_allowed', 'Use GET for reads and POST for actions.');
  } catch (e) {
    if (e instanceof AgentError) return { status: e.status, body: { error: e.message, code: e.code } };
    if (e instanceof NotConnected) return { status: 503, body: { error: e.message, code: 'not_connected' } };
    if (e instanceof GameApiError) return { status: e.status, body: { error: e.message, code: e.code, data: e.data } };
    if (e instanceof UncertainOutcomeError) return { status: 200, body: { error: e.message, uncertain: true } };
    return { status: 500, body: { error: errorMessage(e) } };
  }
}

/** Minimum fields an event carries; `seq` and `at` are added by the main process. */
export type AgentEvent = { type: 'job' | 'arrival' | 'alert' | 'missile' | 'probe'; probeId?: string; [k: string]: unknown };

/**
 * Watch jobs, probes, alerts and sectors and push events to the desktop
 * process, which fans them out to `/api/v1/events` subscribers.
 */
export function installAgentEvents(emit: (e: AgentEvent) => void) {
  const jobState = new Map<string, string>();
  const stopJobs = useJobs.subscribe((s) => {
    for (const j of s.jobs) {
      if (jobState.get(j.id) === j.state) continue;
      jobState.set(j.id, j.state);
      emit({ type: 'job', probeId: j.probeId, id: j.id, name: j.name, kind: j.kind, state: j.state, message: j.message });
    }
  });
  const seenAlerts = new Map<string, Set<string>>();
  const seenMissiles = new Map<string, Set<string>>();
  const lastSector = new Map<string, string>();
  const stopQueries = queryClient.getQueryCache().subscribe((ev) => {
    if (ev.type !== 'updated' || ev.action.type !== 'success') return;
    const key = ev.query.queryKey as unknown[];
    const data = ev.query.state.data;
    if (key[0] === 'alerts' && Array.isArray(data)) {
      const pid = String(key[1]);
      const seen = seenAlerts.get(pid);
      const ids = new Set((data as { id: string }[]).map((a) => a.id));
      if (seen) for (const a of data as { id: string; title: string; message?: string; severity?: string; status?: string }[]) if (!seen.has(a.id)) emit({ type: 'alert', probeId: pid, id: a.id, title: a.title, message: a.message, severity: a.severity });
      seenAlerts.set(pid, ids);
    } else if (key[0] === 'sector' && data && typeof data === 'object') {
      const pid = String(key[1]);
      const list = missiles((data as { sector?: Sector }).sector, pid);
      const seen = seenMissiles.get(pid) ?? new Set<string>();
      for (const m of list) if (!seen.has(m.id)) emit({ type: 'missile', probeId: pid, id: m.id, launcherId: m.launcherId, launcherName: m.launcherName, targetId: m.targetId, targetName: m.targetName, inbound: m.targetsCurrentProbe, impactAt: m.impactAt });
      seenMissiles.set(pid, new Set(list.map((m) => m.id)));
    } else if (key[0] === 'probe' && data && typeof data === 'object') {
      const p = data as Probe;
      const at = p.sector ? `${p.sector.x},${p.sector.y},${p.sector.z}` : '';
      const prev = lastSector.get(p.id);
      if (prev !== undefined && prev !== at && at && !isMoving(p)) emit({ type: 'arrival', probeId: p.id, name: p.name, sector: p.sector });
      if (prev !== undefined && prev === at && at && isMoving(p) && !lastMoving.get(p.id)) emit({ type: 'probe', probeId: p.id, name: p.name, status: p.status, movement: p.movement });
      lastMoving.set(p.id, isMoving(p));
      lastSector.set(p.id, at);
    }
  });
  const lastMoving = new Map<string, boolean>();
  return () => {
    stopJobs();
    stopQueries();
  };
}
