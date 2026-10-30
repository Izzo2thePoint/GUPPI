/**
 * Typed views of game responses.
 *
 * The public API documents request bodies precisely but responses only loosely, so
 * every normalizer here is defensive: unknown fields are preserved on `raw`,
 * malformed fields become `undefined`, and nothing throws on unexpected data.
 */
export type Coord = { x: number; y: number; z: number };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
const id = (v: unknown) => (typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function coord(v: unknown): Coord | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const x = num(o.x),
    y = num(o.y),
    z = num(o.z);
  return x !== undefined && y !== undefined && z !== undefined ? { x, y, z } : undefined;
}

export const MOVING_STATES = ['preparing', 'accelerating', 'cruising', 'decelerating'];
export const UNREACHABLE_STATES = ['out_of_scut_range', 'dead', 'destroyed', 'disabled', 'trapped_by_black_hole'];

export type Movement = {
  status?: string;
  origin?: Coord;
  target?: Coord;
  arrivalAt?: string;
  departedAt?: string;
  secondsRemaining?: number;
  estimatedVelocityC?: number;
};

export type ResourceStock = {
  id: string;
  type: string;
  name: string;
  amount: number;
  containers: { containerId: string; label?: string; amount: number }[];
};

export type InventoryItem = {
  id: string;
  type: string;
  name?: string;
  containerSpace?: number;
  currentTask?: string | null;
  containerId?: string;
  raw: Obj;
};

export type Container = {
  id: string;
  kind?: string;
  label: string;
  capacity?: number;
  usedCapacity?: number;
  freeCapacity?: number;
  rules?: StorageRules;
  raw: Obj;
};

export type StorageRules = { priority: string[]; exclusion: string[]; strictExclusion: string[] };

export type Inventory = {
  capacity?: number;
  usedCapacity?: number;
  freeCapacity?: number;
  resourceStocks: ResourceStock[];
  containers: Container[];
  items: InventoryItem[];
};

export type Probe = {
  id: string;
  name: string;
  status: string;
  isReachable?: boolean;
  isDefault?: boolean;
  sector?: Coord;
  integrity?: number;
  deuterium?: number;
  deuteriumCapacity?: number;
  movement?: Movement | null;
  inventory?: Inventory;
  raw: Obj;
};

export type Manny = {
  id: string;
  name: string;
  currentTask: string | null | undefined;
  canReceiveOrders: boolean;
  locationType?: string;
  locationSector?: Coord;
  progress?: number;
  taskStart?: string;
  taskEnd?: string;
  task?: Obj;
  /** Cargo per mining trip in ECE; the game default is 0.05. */
  cargoCapacity?: number;
  /** Detached container a mining task delivers into, when any. */
  taskContainerId?: string;
  taskObjectId?: string;
  raw: Obj;
};

/** Where a child body was listed on its parent in the game response. */
export type ChildRole = 'mineable' | 'bookmark' | 'planet' | 'moon' | 'star' | 'object';

export type SectorObject = {
  id: string;
  type: string;
  name: string;
  raw: Obj;
  resourceAmounts?: Record<string, number>;
  resourceTypes?: string[];
  mannyMineable?: boolean;
  estimated?: boolean;
  inTransit?: boolean;
  inspectable?: boolean;
  salvageable?: boolean;
  role?: ChildRole;
  children: SectorObject[];
};

export type ScutNetworkRef = { id: string; name: string };

export type Sector = {
  coord?: Coord;
  knowledgeLevel?: string;
  dataFreshness?: string;
  objects: SectorObject[];
  probes: { id: string; name?: string; status?: string }[];
  scutCoverage?: string;
  scutNetworks: ScutNetworkRef[];
  navigationalRisk?: string;
  raw: Obj;
};

export type Recipe = {
  id: string;
  name: string;
  durationSeconds: number;
  craftableBy: string[];
  ingredients: { type: string; quantity: number; unit: string }[];
  outputType?: string;
  outputSpace?: number;
  raw: Obj;
};

export type Improvement = {
  id: string;
  name: string;
  description?: string;
  available: boolean;
  done: boolean;
  installableOnProbe: boolean;
  durationSeconds?: number;
  ingredients: { type: string; quantity: number; unit: string }[];
};

export type Message = {
  id: string;
  status?: string;
  body: string;
  sender?: string;
  sentAt?: string;
  raw: Obj;
};

export type Alert = {
  id: string;
  status?: string;
  title: string;
  message?: string;
  severity?: string;
  createdAt?: string;
  raw: Obj;
};

export type LogbookPage = {
  id: string;
  title: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type VisitedSector = { coord: Coord; firstVisitedAt?: string; lastVisitedAt?: string; visitCount?: number; probeId?: string };

function normRules(v: unknown): StorageRules | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const list = (x: unknown) => arr(x).filter((s): s is string => typeof s === 'string');
  return { priority: list(o.priority), exclusion: list(o.exclusion), strictExclusion: list(o.strictExclusion) };
}

export function normContainer(v: unknown): Container | undefined {
  const o = obj(v);
  const cid = id(o?.id);
  if (!o || !cid) return undefined;
  return {
    id: cid,
    kind: str(o.kind),
    label: str(o.label) ?? str(o.name) ?? cid,
    capacity: num(o.capacity),
    usedCapacity: num(o.usedCapacity),
    freeCapacity: num(o.freeCapacity),
    rules: normRules(o.rules),
    raw: o,
  };
}

export function normInventory(v: unknown): Inventory | undefined {
  const o = obj(v);
  if (!o) return undefined;
  return {
    capacity: num(o.capacity),
    usedCapacity: num(o.usedCapacity),
    freeCapacity: num(o.freeCapacity),
    resourceStocks: arr(o.resourceStocks).flatMap((r) => {
      const s = obj(r);
      const type = str(s?.type) ?? str(s?.id);
      if (!s || !type) return [];
      return [
        {
          id: id(s.id) ?? type,
          type,
          name: str(s.name) ?? label(type),
          amount: num(s.amount) ?? 0,
          containers: arr(s.containers).flatMap((c) => {
            const co = obj(c);
            const cid = id(obj(co?.container)?.id) ?? id(co?.containerId);
            return co && cid ? [{ containerId: cid, label: str(obj(co.container)?.label), amount: num(co.amount) ?? 0 }] : [];
          }),
        },
      ];
    }),
    containers: arr(o.containers).flatMap((c) => normContainer(c) ?? []),
    items: arr(o.items).flatMap((i) => normItem(i) ?? []),
  };
}

export function normItem(v: unknown): InventoryItem | undefined {
  const it = obj(v);
  const iid = id(it?.id);
  if (!it || !iid) return undefined;
  return {
    id: iid,
    type: str(it.type) ?? 'unknown',
    name: str(it.name),
    containerSpace: num(it.containerSpace),
    currentTask: it.currentTask === null ? null : str(it.currentTask),
    containerId: id(obj(it.container)?.id) ?? id(it.containerId),
    raw: it,
  };
}

export function normProbe(v: unknown): Probe | undefined {
  const o = obj(v);
  const pid = id(o?.id);
  if (!o || !pid) return undefined;
  const m = obj(o.movement);
  const fuel = obj(o.fuel);
  return {
    id: pid,
    name: str(o.name) ?? `Probe ${pid}`,
    status: str(o.status) ?? 'unknown',
    isReachable: bool(o.isReachable),
    isDefault: bool(o.isDefault),
    sector: coord(obj(o.sector)?.relative) ?? coord(o.sector) ?? coord(o.relativeCoordinates) ?? coord(obj(o.coordinates)?.relative) ?? coord(obj(obj(o.location)?.sector)?.relative),
    integrity: num(obj(o.systems)?.integrityPercent) ?? num(o.integrityPercent),
    deuterium: num(fuel?.deuterium),
    deuteriumCapacity: num(fuel?.deuteriumCapacity) ?? num(fuel?.capacity),
    movement: m
      ? {
          status: str(m.status),
          origin: coord(m.origin),
          target: coord(m.target),
          arrivalAt: str(m.arrivalAt),
          departedAt: str(m.departedAt) ?? str(m.startedAt),
          secondsRemaining: num(m.secondsRemaining),
          estimatedVelocityC: num(m.estimatedVelocityC),
        }
      : null,
    inventory: normInventory(o.inventory),
    raw: o,
  };
}

export function normManny(v: unknown): Manny | undefined {
  const o = obj(v);
  const mid = id(o?.id);
  if (!o || !mid) return undefined;
  const loc = obj(o.location);
  const task = obj(o.task);
  return {
    id: mid,
    name: str(o.name) ?? `Manny ${mid}`,
    currentTask: o.currentTask === null ? null : str(o.currentTask),
    canReceiveOrders: o.canReceiveOrders === true,
    locationType: str(loc?.type),
    locationSector: coord(obj(loc?.sector)?.relative),
    progress: num(o.taskProgressPercent),
    taskStart: str(o.taskStartTime),
    taskEnd: str(o.taskEstimatedEndTime),
    task,
    cargoCapacity: num(obj(o.cargo)?.capacity),
    taskContainerId: id(obj(task?.targetContainer)?.id) ?? id(task?.targetContainerId),
    taskObjectId: id(task?.objectId),
    raw: o,
  };
}

/**
 * Bodies nested under a parent. Stellar systems list their mineable planets,
 * moons and belts in `minableTargets` and waypoint candidates in
 * `bookmarkTargets`; older or richer payloads may also use planets/moons/stars.
 */
const CHILD_KEYS: [string, ChildRole][] = [
  ['minableTargets', 'mineable'],
  ['bookmarkTargets', 'bookmark'],
  ['planets', 'planet'],
  ['moons', 'moon'],
  ['stars', 'star'],
  ['objects', 'object'],
];

export function normSectorObject(v: unknown, depth = 0, role?: ChildRole): SectorObject | undefined {
  const o = obj(v);
  if (!o || depth > 6) return undefined;
  const type = str(o.type) ?? (role === 'star' ? 'star' : role === 'moon' ? 'moon' : role === 'planet' ? 'planet' : 'object');
  const name = str(o.name) ?? str(o.label);
  const oid = id(o.id) ?? `${type}:${name ?? depth}:${JSON.stringify(o).length}`;
  const seen = new Set<string>();
  const children: SectorObject[] = [];
  for (const [key, r] of CHILD_KEYS)
    for (const c of arr(o[key])) {
      const n = normSectorObject(c, depth + 1, r);
      if (!n) continue;
      const existing = children.find((x) => x.id === n.id);
      if (existing) {
        // Listed both as mineable and as a bookmark target: keep one entry.
        if (r === 'mineable') existing.role = 'mineable';
        continue;
      }
      if (!seen.has(n.id)) {
        seen.add(n.id);
        children.push(n);
      }
    }
  const amounts = obj(o.resourceAmounts);
  return {
    id: oid,
    type,
    name: name ?? label(type),
    raw: o,
    resourceAmounts: amounts ? (Object.fromEntries(Object.entries(amounts).filter(([, n]) => typeof n === 'number')) as Record<string, number>) : undefined,
    resourceTypes: arr(o.resourceTypes).filter((s): s is string => typeof s === 'string'),
    mannyMineable: bool(o.mannyMineable),
    estimated: bool(o.estimated),
    inTransit: bool(o.inTransit),
    inspectable: bool(o.inspectable),
    salvageable: bool(o.salvageable),
    role,
    children,
  };
}

export function normSector(v: unknown): Sector | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const cov = o.scutCoverage;
  return {
    coord: coord(o.relativeCoordinates) ?? coord(obj(o.coordinates)?.relative) ?? coord(o),
    knowledgeLevel: str(o.knowledgeLevel),
    dataFreshness: str(o.dataFreshness),
    objects: arr(o.objects).flatMap((x) => normSectorObject(x) ?? []),
    probes: arr(o.probes).flatMap((p) => {
      const po = obj(p);
      const pid = id(po?.id);
      return po && pid ? [{ id: pid, name: str(po.name), status: str(po.status) }] : [];
    }),
    scutCoverage: str(o.scutCoverageStatus) ?? str(obj(cov)?.status) ?? str(cov),
    scutNetworks: arr(o.scutNetworks).flatMap((n) => {
      const no = obj(n);
      const nid = id(no?.id);
      return no && nid ? [{ id: nid, name: str(no.name) ?? `Network ${nid}` }] : [];
    }),
    navigationalRisk: str(o.navigationalRisk),
    raw: o,
  };
}

// ── Sector queries ────────────────────────────────────────────────────────

/** Every body in the sector, nested ones included, each id once. */
export function allBodies(sector?: Sector): SectorObject[] {
  const out = new Map<string, SectorObject>();
  const walk = (list: SectorObject[]) => {
    for (const o of list) {
      if (!out.has(o.id)) out.set(o.id, o);
      walk(o.children);
    }
  };
  walk(sector?.objects ?? []);
  return [...out.values()];
}

export const SOLID_RESOURCES = ['metals', 'ice', 'carbon_compounds'];
export const MINE_RESOURCES = ['deuterium', ...SOLID_RESOURCES];

export type MiningTarget = { id: string; name: string; type: string; resourceTypes: string[]; resourceAmounts?: Record<string, number>; parent?: string };

/**
 * Bodies a Manny can mine: top-level objects flagged mannyMineable, plus every
 * body a stellar system lists in minableTargets. Estimated or in-transit bodies
 * and exhausted resources are excluded.
 */
export function miningTargets(sector?: Sector): MiningTarget[] {
  const out = new Map<string, MiningTarget>();
  const add = (o: SectorObject, nested: boolean, parent?: string) => {
    if (o.estimated || o.inTransit || o.mannyMineable === false || !o.resourceTypes?.length) return;
    if (!nested && o.mannyMineable !== true) return;
    const resources = o.resourceTypes.filter((r) => MINE_RESOURCES.includes(r) && !(typeof o.resourceAmounts?.[r] === 'number' && o.resourceAmounts[r] <= 0));
    if (resources.length) out.set(o.id, { id: o.id, name: o.name, type: o.type, resourceTypes: resources, resourceAmounts: o.resourceAmounts, parent });
  };
  const walk = (list: SectorObject[], parent?: SectorObject) => {
    for (const o of list) {
      add(o, !!parent && o.role === 'mineable', parent?.name);
      walk(o.children, o);
    }
  };
  walk(sector?.objects ?? []);
  return [...out.values()];
}

// ── Tactical ──────────────────────────────────────────────────────────────

/** A missile the sector reports, in preparation or in flight. Field names vary, so every candidate is read. */
export type Missile = {
  id: string;
  status?: string;
  launcherId?: string;
  launcherName?: string;
  targetId?: string;
  targetName?: string;
  /** The game's own flag: this missile is aimed at the observing probe. */
  targetsCurrentProbe: boolean;
  launchedAt?: string;
  impactAt?: string;
  secondsRemaining?: number;
  raw: Obj;
};

export function normMissile(v: unknown, observerId?: string): Missile | undefined {
  const o = obj(v);
  const mid = id(o?.id);
  if (!o || !mid) return undefined;
  const launcher = obj(o.launcher) ?? obj(o.source) ?? obj(o.firedBy) ?? obj(o.owner);
  const target = obj(o.target);
  const targetId = id(o.targetId) ?? id(o.targetProbeId) ?? id(o.targetObjectId) ?? id(target?.id);
  return {
    id: mid,
    status: str(o.status) ?? str(o.phase) ?? str(o.state),
    launcherId: id(o.launcherId) ?? id(o.launcherProbeId) ?? id(o.sourceId) ?? id(o.ownerProbeId) ?? id(o.firedById) ?? id(launcher?.id),
    launcherName: str(o.launcherName) ?? str(o.sourceName) ?? str(o.ownerName) ?? str(launcher?.name),
    targetId,
    targetName: str(o.targetName) ?? str(target?.name),
    targetsCurrentProbe: o.targetsCurrentProbe === true || (observerId !== undefined && targetId === observerId),
    launchedAt: str(o.launchedAt) ?? str(o.firedAt) ?? str(o.startedAt) ?? str(o.createdAt),
    impactAt: str(o.impactAt) ?? str(o.estimatedImpactAt) ?? str(o.arrivalAt) ?? str(o.eta),
    secondsRemaining: num(o.secondsRemaining) ?? num(o.etaSeconds) ?? num(o.timeToImpactSeconds),
    raw: o,
  };
}

/** Missiles in the sector, nested ones included. */
export const missiles = (sector?: Sector, observerId?: string): Missile[] =>
  allBodies(sector)
    .filter((o) => /missile/i.test(o.type))
    .flatMap((o) => normMissile(o.raw, observerId) ?? []);

/** A ship in the sector: one of your probes, another player's, or an Others craft. */
export type Contact = {
  id: string;
  name: string;
  type: string;
  kind: 'own' | 'probe' | 'others' | 'unknown';
  status?: string;
  integrity?: number;
  hostile?: boolean;
  raw: Obj;
};

const SHIP_TYPE = /ship|vessel|craft|probe|drone|sentinel|mothership|fleet|hunter|raider/i;
const WRECK = /wreck|derelict|debris|hulk/i;

/**
 * Every ship in the sector other than the observer: the game lists probes under
 * `probes` and Others craft as objects. Wrecks are salvage, not contacts.
 */
export function contacts(sector: Sector | undefined, observerId?: string, ownIds: string[] = []): Contact[] {
  const out = new Map<string, Contact>();
  for (const p of sector?.probes ?? []) {
    if (p.id === observerId) continue;
    const raw = (sector?.raw.probes as unknown[] | undefined)?.map(obj).find((o) => id(o?.id) === p.id) ?? {};
    out.set(p.id, { id: p.id, name: p.name ?? `Probe ${p.id}`, type: 'probe', kind: ownIds.includes(p.id) ? 'own' : 'probe', status: p.status, integrity: num(obj(raw.systems)?.integrityPercent) ?? num(raw.integrity) ?? num(raw.integrityPercent), hostile: bool(raw.hostile), raw });
  }
  for (const o of allBodies(sector)) {
    if (o.id === observerId || out.has(o.id) || /missile/i.test(o.type)) continue;
    if (!SHIP_TYPE.test(`${o.type} ${o.raw.category ?? ''}`) || WRECK.test(`${o.type} ${o.name}`)) continue;
    const others = /others/i.test(o.type) || /others/i.test(String(o.raw.faction ?? o.raw.owner ?? ''));
    out.set(o.id, {
      id: o.id,
      name: o.name,
      type: o.type,
      kind: ownIds.includes(o.id) ? 'own' : others ? 'others' : o.type === 'probe' ? 'probe' : 'unknown',
      status: str(o.raw.status),
      integrity: num(o.raw.integrity) ?? num(o.raw.integrityPercent) ?? num(obj(o.raw.systems)?.integrityPercent),
      hostile: bool(o.raw.hostile) ?? (others ? true : undefined),
      raw: o.raw,
    });
  }
  return [...out.values()];
}

export const scutRelays = (sector?: Sector) => allBodies(sector).filter((o) => o.type === 'scut_relay' || /scut.?relay/i.test(o.type));
export const detachedContainers = (sector?: Sector) => allBodies(sector).filter((o) => o.type === 'detached_container' || o.type === 'detached_storage_container');
export const asteroids = (sector?: Sector) => allBodies(sector).filter((o) => o.type === 'asteroid' && !o.estimated && !o.inTransit);
/** The game requires a "deuterium refuel station" in the sector for tank refills. */
export const refuelStations = (sector?: Sector) =>
  allBodies(sector).filter((o) => /refuel|fuel.?station|deuterium.?station|fuel.?depot/i.test(`${o.type} ${o.name}`) || o.raw.deuteriumRefuelStation === true);
export const hasRefuelStation = (sector?: Sector) => refuelStations(sector).length > 0 || sector?.raw.deuteriumRefuelStation === true || sector?.raw.hasDeuteriumRefuelStation === true;

const ingredients = (v: unknown) =>
  arr(v).flatMap((i) => {
    const o = obj(i);
    const type = str(o?.type);
    return o && type ? [{ type, quantity: num(o.quantity) ?? 0, unit: str(o.unit) ?? 'item' }] : [];
  });

export function normRecipe(v: unknown): Recipe | undefined {
  const o = obj(v);
  const rid = id(o?.id);
  if (!o || !rid) return undefined;
  const out = obj(o.output);
  return {
    id: rid,
    name: str(o.name) ?? label(rid),
    durationSeconds: num(o.durationSeconds) ?? 0,
    craftableBy: arr(o.craftableBy).filter((s): s is string => typeof s === 'string'),
    ingredients: ingredients(o.ingredients),
    outputType: str(out?.type) ?? rid,
    outputSpace: num(out?.containerSpace),
    raw: o,
  };
}

export function normImprovement(v: unknown): Improvement | undefined {
  const o = obj(v);
  const iid = id(o?.id);
  if (!o || !iid) return undefined;
  return {
    id: iid,
    name: str(o.name) ?? label(iid),
    description: str(o.description),
    available: o.available !== false,
    done: o.done === true,
    installableOnProbe: o.installableOnProbe !== false,
    durationSeconds: num(o.durationSeconds),
    ingredients: ingredients(o.ingredients),
  };
}

export function normMessage(v: unknown): Message | undefined {
  const o = obj(v);
  const mid = id(o?.id);
  if (!o || !mid) return undefined;
  const sender = obj(o.sender) ?? obj(o.from);
  return {
    id: mid,
    status: str(o.status) ?? (o.readAt ? 'read' : undefined),
    body: str(o.body) ?? str(o.content) ?? str(o.text) ?? '',
    sender: str(sender?.name) ?? id(sender?.id) ?? str(o.senderName) ?? id(o.senderProbeId),
    sentAt: str(o.sentAt) ?? str(o.createdAt) ?? str(o.receivedAt),
    raw: o,
  };
}

export function normAlert(v: unknown): Alert | undefined {
  const o = obj(v);
  const aid = id(o?.id);
  if (!o || !aid) return undefined;
  return {
    id: aid,
    status: str(o.status) ?? (o.readAt ? 'read' : o.read === true ? 'read' : undefined),
    title: str(o.title) ?? str(o.type) ?? str(o.kind) ?? 'Alert',
    message: str(o.message) ?? str(o.body) ?? str(o.description),
    severity: str(o.severity) ?? str(o.level),
    createdAt: str(o.createdAt) ?? str(o.occurredAt),
    raw: o,
  };
}

export function normLogbookPage(v: unknown): LogbookPage | undefined {
  const o = obj(v);
  const pid = id(o?.id);
  if (!o || !pid) return undefined;
  return { id: pid, title: str(o.title) ?? 'Untitled', content: str(o.content), createdAt: str(o.createdAt), updatedAt: str(o.updatedAt) };
}

export function normVisited(v: unknown, probeId?: string): VisitedSector | undefined {
  const o = obj(v);
  const c = coord(o?.relativeCoordinates) ?? coord(o?.coordinates) ?? coord(o);
  if (!o || !c) return undefined;
  return {
    coord: c,
    firstVisitedAt: str(o.firstVisitedAt),
    lastVisitedAt: str(o.lastVisitedAt),
    visitCount: num(o.visitCount),
    probeId: id(o.probeId) ?? probeId,
  };
}

/** Pull a list out of `{ key: [...] }` or a bare array. */
export function listFrom<T>(data: unknown, key: string, norm: (v: unknown) => T | undefined): T[] {
  const list = Array.isArray(data) ? data : obj(data)?.[key];
  return arr(list).flatMap((v) => norm(v) ?? []);
}

export function totalFrom(data: unknown): number | undefined {
  return num(obj(obj(data)?.pagination)?.total);
}

export const label = (v: unknown) => {
  const s = String(v ?? 'unknown').replaceAll('_', ' ').replaceAll('-', ' ').replace(/\bscut\b/gi, 'SCUT');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const isMoving = (p?: Pick<Probe, 'status'> | null) => !!p && MOVING_STATES.includes(p.status);
export const isReachable = (p?: Pick<Probe, 'status' | 'isReachable'> | null) =>
  !!p && p.isReachable !== false && !UNREACHABLE_STATES.includes(p.status);
export const mannyReady = (m: Manny) => m.locationType === 'probe' && m.currentTask === null && m.canReceiveOrders;
