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
  raw: Obj;
};

export type SectorObject = {
  id: string;
  type: string;
  name: string;
  raw: Obj;
  resourceAmounts?: Record<string, number>;
  resourceTypes?: string[];
  mannyMineable?: boolean;
  children: SectorObject[];
};

export type Sector = {
  coord?: Coord;
  knowledgeLevel?: string;
  objects: SectorObject[];
  probes: { id: string; name?: string; status?: string }[];
  scutCoverage?: string;
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
    items: arr(o.items).flatMap((i) => {
      const it = obj(i);
      const iid = id(it?.id);
      if (!it || !iid) return [];
      return [
        {
          id: iid,
          type: str(it.type) ?? 'unknown',
          name: str(it.name),
          containerSpace: num(it.containerSpace),
          currentTask: it.currentTask === null ? null : str(it.currentTask),
          containerId: id(obj(it.container)?.id) ?? id(it.containerId),
          raw: it,
        },
      ];
    }),
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
    sector: coord(obj(o.sector)?.relative) ?? coord(o.sector) ?? coord(o.relativeCoordinates),
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
    task: obj(o.task),
    raw: o,
  };
}

export function normSectorObject(v: unknown, depth = 0): SectorObject | undefined {
  const o = obj(v);
  if (!o || depth > 6) return undefined;
  const type = str(o.type) ?? 'object';
  const oid = id(o.id) ?? `${type}:${str(o.name) ?? Math.random().toString(36).slice(2)}`;
  const children = [...arr(o.planets), ...arr(o.moons), ...arr(o.objects), ...arr(o.stars)].flatMap((c) => normSectorObject(c, depth + 1) ?? []);
  const amounts = obj(o.resourceAmounts);
  return {
    id: oid,
    type,
    name: str(o.name) ?? label(type),
    raw: o,
    resourceAmounts: amounts ? Object.fromEntries(Object.entries(amounts).filter(([, n]) => typeof n === 'number')) as Record<string, number> : undefined,
    resourceTypes: arr(o.resourceTypes).filter((s): s is string => typeof s === 'string'),
    mannyMineable: bool(o.mannyMineable),
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
    objects: arr(o.objects).flatMap((x) => normSectorObject(x) ?? []),
    probes: arr(o.probes).flatMap((p) => {
      const po = obj(p);
      const pid = id(po?.id);
      return po && pid ? [{ id: pid, name: str(po.name), status: str(po.status) }] : [];
    }),
    scutCoverage: str(o.scutCoverageStatus) ?? str(obj(cov)?.status) ?? str(cov),
    raw: o,
  };
}

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
