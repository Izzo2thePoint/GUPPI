/**
 * Typed façade over the scheduler: one method per documented endpoint that GUPPI
 * uses directly. Everything else is reachable through `raw()` / the API console.
 */
import type { Command } from './catalog';
import {
  listFrom,
  normAlert,
  normContainer,
  normImprovement,
  normInventory,
  normLogbookPage,
  normManny,
  normMessage,
  normProbe,
  normRecipe,
  normSector,
  normVisited,
  totalFrom,
  type Coord,
  type StorageRules,
} from './models';
import type { Priority, RequestOptions, Scheduler } from './scheduler';

type Opt = RequestOptions;
const P = (probeId: string, extra: Record<string, string | number | boolean | undefined> = {}) => ({ probeId, ...extra });

export type MannyTask =
  | 'repair' | 'mine' | 'craft' | 'salvage' | 'install-bookmark' | 'detach-storage-container' | 'drop-storage-container'
  | 'drop-manny-cargo' | 'inspect-sector-object' | 'recover-storage-container' | 'refill-deuterium-tank'
  | 'transfer-deuterium-to-probe' | 'transfer-to-probe' | 'turn-on-relay' | 'install-scut-transit-beacon'
  | 'improve-probe' | 'assemble-probe' | 'recall';

export function createGame(scheduler: Scheduler) {
  const req = <T = unknown>(operation: string, params?: Command['params'], body?: unknown, o?: Opt) =>
    scheduler.request<T>({ operation, params, body }, o);
  const bg = (o?: Opt): Opt => ({ priority: 'background' as Priority, ...o });

  return {
    scheduler,
    raw: (command: Command, o?: Opt) => scheduler.request(command, o),

    version: (o?: Opt) => req('GET /api/version', undefined, undefined, o),

    // ── Probes ────────────────────────────────────────────────────────────
    async probes(o?: Opt) {
      const data = await req('GET /api/probes', undefined, undefined, bg(o));
      const d = data as { defaultProbeId?: unknown };
      const list = listFrom(data, 'probes', normProbe);
      const defaultId = d?.defaultProbeId !== undefined ? String(d.defaultProbeId) : undefined;
      return list.map((p) => ({ ...p, isDefault: p.isDefault ?? (defaultId ? p.id === defaultId : undefined) }));
    },
    async defaultProbe(o?: Opt) {
      const data = (await req('GET /api/probe', undefined, undefined, o)) as { probe?: unknown };
      return normProbe(data?.probe ?? data);
    },
    async probe(probeId: string, o?: Opt) {
      const data = (await req('GET /api/probe/{probeId}', P(probeId), undefined, bg(o))) as { probe?: unknown };
      const p = normProbe(data?.probe);
      if (!p || p.id !== probeId) throw new Error('The game did not return the requested probe.');
      return p;
    },
    updateProbe: (probeId: string, body: { name?: string; isDefault?: boolean }, o?: Opt) =>
      req('PATCH /api/probe/{probeId}', P(probeId), body, o),

    // ── Crew ──────────────────────────────────────────────────────────────
    async mannies(probeId: string, o?: Opt) {
      const data = await req('GET /api/probe/{probeId}/mannies', P(probeId), undefined, bg(o));
      return listFrom(data, 'mannies', normManny);
    },
    renameManny: (probeId: string, mannyId: string, name: string, o?: Opt) =>
      req('PATCH /api/probe/{probeId}/mannies/{mannyId}', P(probeId, { mannyId }), { name }, o),
    /** Any `POST /mannies/{mannyId}/<action>` endpoint. */
    mannyAction: (probeId: string, mannyId: string, action: string, body?: unknown, o?: Opt) =>
      req(`POST /api/probe/{probeId}/mannies/{mannyId}/${action}`, P(probeId, { mannyId }), body, o),
    assignTasks: (probeId: string, tasks: { mannyId: string; task: MannyTask; payload: Record<string, unknown> }[], o?: Opt) =>
      req('POST /api/probe/{probeId}/mannies/tasks', P(probeId), { tasks }, o),
    printerCraft: (probeId: string, recipe: string, o?: Opt) =>
      req('POST /api/probe/{probeId}/atomic-printer/craft', P(probeId), { recipe }, o),

    // ── Sensors & navigation ──────────────────────────────────────────────
    async sector(probeId: string, o?: Opt) {
      const data = (await req('GET /api/probe/{probeId}/sector', P(probeId), undefined, bg(o))) as { sector?: unknown };
      return { sector: normSector(data?.sector), inventory: normInventory((data as { inventory?: unknown })?.inventory) };
    },
    async observeSector(c: Coord, o?: Opt) {
      const data = (await req('GET /api/sector', { x: c.x, y: c.y, z: c.z }, undefined, o)) as { sector?: unknown };
      return normSector(data?.sector ?? data);
    },
    async visited(probeId?: string, o?: Opt) {
      const data = probeId
        ? await req('GET /api/probe/{probeId}/visited-sectors', P(probeId), undefined, bg(o))
        : await req('GET /api/visited-sectors', undefined, undefined, bg(o));
      return listFrom(data, 'visitedSectors', (v) => normVisited(v, probeId));
    },
    autonomousUnits: (probeId: string, o?: Opt) =>
      req('GET /api/probe/{probeId}/sector/autonomous-units', P(probeId, { limit: 100 }), undefined, bg(o)),
    move: (probeId: string, target: Coord, o?: Opt) => req('POST /api/probe/{probeId}/move', P(probeId), { target }, o),
    cancelMove: (probeId: string, o?: Opt) => req('DELETE /api/probe/{probeId}/move', P(probeId), undefined, o),
    scutNetwork: (probeId: string, scutNetworkId: string, o?: Opt) =>
      req('GET /api/probe/{probeId}/scut-network/{scutNetworkId}', P(probeId, { scutNetworkId }), undefined, o),

    // ── Inventory ─────────────────────────────────────────────────────────
    async containers(probeId: string, o?: Opt) {
      const data = await req('GET /api/probe/{probeId}/storage-containers', P(probeId), undefined, bg(o));
      return listFrom(data, 'containers', normContainer);
    },
    renameContainer: (probeId: string, containerId: string, label: string, o?: Opt) =>
      req('PATCH /api/probe/{probeId}/storage-containers/{containerId}', P(probeId, { containerId }), { label }, o),
    setRules: (probeId: string, containerId: string, rules: StorageRules, o?: Opt) =>
      req('PATCH /api/probe/{probeId}/storage-containers/{containerId}/rules', P(probeId, { containerId }), rules, o),
    reassignReservations: (probeId: string, containerId: string, o?: Opt) =>
      req('POST /api/probe/{probeId}/storage-containers/{containerId}/crafting-reservations/reassign', P(probeId, { containerId }), {}, o),
    storageMove: (probeId: string, body: Record<string, unknown>, o?: Opt) =>
      req('POST /api/probe/{probeId}/storage-moves', P(probeId), body, o),
    jettison: (probeId: string, itemId: string, body: { amount?: number; containerId?: string }, o?: Opt) =>
      req('POST /api/probe/{probeId}/inventory/{itemId}/jettison', P(probeId, { itemId }), body, o),

    // ── Workshop ──────────────────────────────────────────────────────────
    async recipes(o?: Opt) {
      const data = await req('GET /api/crafting-recipes', undefined, undefined, bg(o));
      return listFrom(data, 'recipes', normRecipe);
    },
    async improvements(probeId: string, o?: Opt) {
      const data = await req('GET /api/probe/{probeId}/probe-improvements-available', P(probeId, { includeAll: 'true' }), undefined, bg(o));
      return listFrom(data, 'improvements', normImprovement);
    },

    // ── Comms ─────────────────────────────────────────────────────────────
    async messages(probeId: string, q: { limit?: number; offset?: number; unread?: boolean } = {}, o?: Opt) {
      const data = await req(
        'GET /api/probe/{probeId}/messages',
        P(probeId, { limit: q.limit ?? 25, offset: q.offset ?? 0, status: q.unread ? 'unread' : undefined }),
        undefined,
        bg(o),
      );
      const messages = listFrom(data, 'messages', normMessage);
      return { messages, total: totalFrom(data) ?? messages.length };
    },
    sendMessage: (probeId: string, recipient: { type: 'probe' | 'planet'; id: string }, body: string, o?: Opt) =>
      req(
        'POST /api/probe/{probeId}/messages',
        P(probeId),
        { recipient: { type: recipient.type, id: recipient.type === 'probe' ? Number(recipient.id) : recipient.id }, body },
        o,
      ),
    markMessageRead: (probeId: string, messageId: string, o?: Opt) =>
      req('PATCH /api/probe/{probeId}/messages/{messageId}/read', P(probeId, { messageId }), undefined, o),
    async alerts(probeId: string, unread = false, o?: Opt) {
      const data = await req('GET /api/probe/{probeId}/alerts', P(probeId, { status: unread ? 'unread' : undefined }), undefined, bg(o));
      return listFrom(data, 'alerts', normAlert);
    },
    markAlertRead: (probeId: string, alertId: string, o?: Opt) =>
      req('PATCH /api/probe/{probeId}/alerts/{alertId}', P(probeId, { alertId }), undefined, o),
    deleteAlert: (probeId: string, alertId: string, o?: Opt) =>
      req('DELETE /api/probe/{probeId}/alerts/{alertId}', P(probeId, { alertId }), undefined, o),
    async damageWarnings(probeId: string, o?: Opt) {
      const data = await req('GET /api/probe/{probeId}/damage-warnings', P(probeId), undefined, bg(o));
      const d = data as Record<string, unknown>;
      return listFrom(d?.damageWarnings ?? d?.warnings ?? data, 'damageWarnings', normAlert);
    },
    markDamageRead: (probeId: string, damageWarningId: string, o?: Opt) =>
      req('PATCH /api/probe/{probeId}/damage-warnings/{damageWarningId}', P(probeId, { damageWarningId }), undefined, o),
    deleteDamage: (probeId: string, damageWarningId: string, o?: Opt) =>
      req('DELETE /api/probe/{probeId}/damage-warnings/{damageWarningId}', P(probeId, { damageWarningId }), undefined, o),

    // ── Logbook ───────────────────────────────────────────────────────────
    async logbook(probeId: string, q: { limit?: number; offset?: number } = {}, o?: Opt) {
      const data = await req('GET /api/probe/{probeId}/logbook-pages', P(probeId, { limit: q.limit ?? 100, offset: q.offset ?? 0 }), undefined, bg(o));
      const pages = listFrom(data, 'pages', normLogbookPage);
      return { pages, total: totalFrom(data) ?? pages.length };
    },
    async logbookPage(probeId: string, pageId: string, o?: Opt) {
      const data = (await req('GET /api/probe/{probeId}/logbook-page/{logbookPageId}', P(probeId, { logbookPageId: pageId }), undefined, o)) as {
        page?: unknown;
      };
      return normLogbookPage(data?.page ?? data);
    },
    createPage: (probeId: string, page: { title: string; content: string }, o?: Opt) =>
      req('POST /api/probe/{probeId}/logbook-page', P(probeId), page, o),
    updatePage: (probeId: string, pageId: string, page: { title?: string; content?: string }, o?: Opt) =>
      req('PATCH /api/probe/{probeId}/logbook-page/{logbookPageId}', P(probeId, { logbookPageId: pageId }), page, o),
    deletePage: (probeId: string, pageId: string, o?: Opt) =>
      req('DELETE /api/probe/{probeId}/logbook-page/{logbookPageId}', P(probeId, { logbookPageId: pageId }), undefined, o),
  };
}

export type Game = ReturnType<typeof createGame>;
