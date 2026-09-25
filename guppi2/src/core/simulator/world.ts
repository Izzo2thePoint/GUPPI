/**
 * An in-memory Neumann Probe universe that speaks the same HTTP shapes as the
 * real API. It powers Simulator mode (demo, UI development, tests) and never
 * contacts the network. Durations are compressed so tasks finish in seconds.
 */
import type { Transport, WireRequest, WireResponse } from '../transport';

type Json = Record<string, any>;
type C = { x: number; y: number; z: number };

const iso = (t: number) => new Date(t).toISOString();
const clone = <T>(v: T): T => structuredClone(v);

const RECIPES: Json[] = [
  { id: 'steel_bar', name: 'Steel bar', durationSeconds: 20, craftableBy: ['manny'], ingredients: [{ type: 'metals', quantity: 0.1, unit: 'earth_container_equivalent' }], output: { type: 'steel_bar', containerSpace: 0.01 } },
  { id: 'steel_plate', name: 'Steel plate', durationSeconds: 25, craftableBy: ['manny'], ingredients: [{ type: 'steel_bar', quantity: 2, unit: 'item' }], output: { type: 'steel_plate', containerSpace: 0.02 } },
  { id: 'electric_motor', name: 'Electric motor', durationSeconds: 40, craftableBy: ['manny'], ingredients: [{ type: 'steel_bar', quantity: 1, unit: 'item' }, { type: 'metals', quantity: 0.05, unit: 'earth_container_equivalent' }], output: { type: 'electric_motor', containerSpace: 0.02 } },
  { id: 'battery_pack', name: 'Battery pack', durationSeconds: 30, craftableBy: ['manny'], ingredients: [{ type: 'metals', quantity: 0.05, unit: 'earth_container_equivalent' }, { type: 'carbon_compounds', quantity: 0.05, unit: 'earth_container_equivalent' }], output: { type: 'battery_pack', containerSpace: 0.01 } },
  { id: 'solar_panel', name: 'Solar panel', durationSeconds: 35, craftableBy: ['manny'], ingredients: [{ type: 'steel_plate', quantity: 1, unit: 'item' }, { type: 'carbon_compounds', quantity: 0.02, unit: 'earth_container_equivalent' }], output: { type: 'solar_panel', containerSpace: 0.03 } },
  { id: 'additional_container', name: 'Additional container', durationSeconds: 45, craftableBy: ['manny'], ingredients: [{ type: 'steel_plate', quantity: 4, unit: 'item' }], output: { type: 'additional_container', containerSpace: 0 } },
  { id: 'waypoint_bookmark', name: 'Waypoint bookmark', durationSeconds: 30, craftableBy: ['manny'], ingredients: [{ type: 'electric_motor', quantity: 1, unit: 'item' }, { type: 'battery_pack', quantity: 1, unit: 'item' }], output: { type: 'waypoint_bookmark', containerSpace: 0.02 } },
  { id: 'deuterium_engine', name: 'Deuterium engine', durationSeconds: 60, craftableBy: ['manny'], ingredients: [{ type: 'steel_plate', quantity: 2, unit: 'item' }, { type: 'electric_motor', quantity: 2, unit: 'item' }], output: { type: 'deuterium_engine', containerSpace: 0.05 } },
  { id: 'micro_conductor', name: 'Micro conductor', durationSeconds: 20, craftableBy: ['atomic_3d_printer'], ingredients: [{ type: 'metals', quantity: 0.02, unit: 'earth_container_equivalent' }], output: { type: 'micro_conductor', containerSpace: 0.001 } },
  { id: 'integrated_circuit', name: 'Integrated circuit', durationSeconds: 30, craftableBy: ['atomic_3d_printer'], ingredients: [{ type: 'micro_conductor', quantity: 2, unit: 'item' }, { type: 'carbon_compounds', quantity: 0.01, unit: 'earth_container_equivalent' }], output: { type: 'integrated_circuit', containerSpace: 0.001 } },
  { id: 'manny', name: 'Manny', durationSeconds: 90, craftableBy: ['manny'], ingredients: [{ type: 'electric_motor', quantity: 2, unit: 'item' }, { type: 'battery_pack', quantity: 1, unit: 'item' }, { type: 'steel_plate', quantity: 2, unit: 'item' }], output: { type: 'manny', containerSpace: 0.05 } },
];

const IMPROVEMENTS: Json[] = [
  { id: 'deuterium_compression', name: 'Deuterium compression', description: 'Increase deuterium tank capacity by 25%.', available: true, done: false, installableOnProbe: true, durationSeconds: 60, ingredients: [{ type: 'electric_motor', quantity: 1, unit: 'item' }, { type: 'steel_bar', quantity: 2, unit: 'item' }] },
  { id: 'reinforced_container_couplings', name: 'Reinforced container couplings', description: 'Reduce structural stress when hauling extra containers.', available: true, done: false, installableOnProbe: true, durationSeconds: 90, ingredients: [{ type: 'steel_plate', quantity: 3, unit: 'item' }] },
  { id: 'relativistic_path_clearing', name: 'Relativistic path clearing', description: 'Lower micrometeoroid damage at high velocity.', available: false, done: false, installableOnProbe: true, durationSeconds: 120, ingredients: [{ type: 'integrated_circuit', quantity: 2, unit: 'item' }] },
];

const STAR_NAMES = ['Kepler-442', 'Tau Ceti', 'Gliese 667', 'HD 40307', 'Wolf 1061', 'Luyten b', 'Ross 128', 'Teegarden', 'Epsilon Eridani', 'Delta Pavonis', 'Omicron2 Eridani', 'Van Maanen'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function sectorAt(c: C): Json {
  const seed = (c.x * 73856093) ^ (c.y * 19349663) ^ (c.z * 83492791);
  const r = rng(seed);
  const objects: Json[] = [];
  if (r() < 0.55) {
    const name = STAR_NAMES[Math.floor(r() * STAR_NAMES.length)] + (c.x || c.y || c.z ? ` ${String.fromCharCode(65 + Math.floor(r() * 8))}` : '');
    const planets = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => ({
      id: `planet-${c.x}-${c.y}-${c.z}-${i}`,
      type: 'planet',
      name: `${name} ${['b', 'c', 'd', 'e', 'f', 'g'][i]}`,
      habitable: r() < 0.15,
      habitabilityScore: Math.round(r() * 100) / 100,
      resourceAmounts: { metals: Math.round(r() * 800) / 10, ice: Math.round(r() * 400) / 10 },
    }));
    objects.push({ id: `system-${c.x}-${c.y}-${c.z}`, type: 'solar_system', name, starCount: 1 + (r() < 0.3 ? 1 : 0), stars: [{ name: `${name} A`, type: 'star', massSolar: Math.round((0.3 + r() * 1.5) * 100) / 100, temperatureK: Math.round(3000 + r() * 4500) }], planets });
  }
  const asteroids = Math.floor(r() * 4);
  for (let i = 0; i < asteroids; i++) {
    const res = ['metals', 'ice', 'carbon_compounds'].filter(() => r() < 0.6);
    if (!res.length) res.push('metals');
    objects.push({ id: `rock-${c.x}-${c.y}-${c.z}-${i}`, type: 'asteroid', name: `Asteroid ${String.fromCharCode(945 + i)}-${Math.abs(c.x * 7 + c.y * 3 + c.z) % 97}`, mannyMineable: true, motorized: false, resourceTypes: res, resourceAmounts: Object.fromEntries(res.map((k) => [k, Math.round(r() * 60) / 10 + 0.5])) });
  }
  if (r() < 0.12) objects.push({ id: `wreck-${c.x}-${c.y}-${c.z}`, type: 'others_mothership_wreck', name: 'Derelict Others mothership', mannyMineable: true, resourceTypes: ['metals'], resourceAmounts: { metals: 12 } });
  if (r() < 0.1) objects.push({ id: `dust-${c.x}-${c.y}-${c.z}`, type: 'dust_cloud', name: 'Dust cloud', density: Math.round(r() * 1000) / 1e5 });
  if (r() < 0.04) objects.push({ id: `bh-${c.x}-${c.y}-${c.z}`, type: 'black_hole', name: 'Stellar-mass black hole', dangerLevel: 'extreme' });
  return { relativeCoordinates: c, knowledgeLevel: 'detailed', objects, scutCoverage: { status: r() < 0.3 ? 'covered' : 'none' } };
}

type Task = { mannyId: string; probeId: string; task: string; start: number; end: number; done: () => void };

export function createSimulator(options: { now?: () => number; speed?: number } = {}): Transport {
  const now = options.now ?? Date.now;
  const speed = options.speed ?? 1;
  const t0 = now();
  const probes: Json[] = [
    mkProbe(1, 'Bob', { x: 0, y: 0, z: 0 }, 'idle', 92, 81),
    mkProbe(2, 'Riker', { x: 2, y: 0, z: 0 }, 'cruising', 64, 47),
    mkProbe(3, 'Bill', { x: 1, y: 1, z: 2 }, 'idle', 100, 100),
    { id: 4, name: 'Homer', status: 'out_of_scut_range', isReachable: false, sector: { relative: { x: 8, y: 4, z: -2 } } },
  ];
  probes[1].movement = { status: 'cruising', origin: { x: 2, y: 0, z: 0 }, target: { x: 4, y: 2, z: 0 }, departedAt: iso(t0 - 60_000), arrivalAt: iso(t0 + 150_000), estimatedVelocityC: 0.82 };
  const crew: Record<string, Json[]> = {
    1: [mkManny('m-1a', 'Guppy'), mkManny('m-1b', 'Mario'), mkManny('m-1c', 'Luigi'), mkManny('m-1d', 'Hal')],
    2: [mkManny('m-2a', 'Data'), mkManny('m-2b', 'Geordi')],
    3: [mkManny('m-3a', 'Garfield'), mkManny('m-3b', 'Odie'), mkManny('m-3c', 'Nermal')],
  };
  const tasks: Task[] = [];
  const visited: Record<string, Json[]> = {};
  for (const p of probes.slice(0, 3)) visited[p.id] = [{ relativeCoordinates: p.sector.relative, firstVisitedAt: iso(t0 - 864e5 * 9), lastVisitedAt: iso(t0 - 864e5), visitCount: 3 }];
  visited[1].push(...[{ x: -1, y: 1, z: 0 }, { x: 0, y: -1, z: 1 }, { x: 1, y: 0, z: -1 }, { x: -2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }].map((c, i) => ({ relativeCoordinates: c, firstVisitedAt: iso(t0 - 864e5 * (20 - i)), lastVisitedAt: iso(t0 - 864e5 * (10 - i)), visitCount: 1 })));
  const sectors = new Map<string, Json>();
  const sectorFor = (c: C) => {
    const k = `${c.x},${c.y},${c.z}`;
    if (!sectors.has(k)) sectors.set(k, sectorAt(c));
    return sectors.get(k)!;
  };
  // Make sure the home sector is interesting.
  const home = sectorFor({ x: 0, y: 0, z: 0 });
  home.objects = [
    { id: 'system-home', type: 'solar_system', name: 'Epsilon Eridani', starCount: 1, stars: [{ name: 'Epsilon Eridani A', type: 'star', massSolar: 0.82, temperatureK: 5084 }], planets: [{ id: 'planet-home-b', type: 'planet', name: 'Epsilon Eridani b', habitable: false, habitabilityScore: 0.12, resourceAmounts: { metals: 55.2, ice: 12.1 } }, { id: 'planet-home-c', type: 'planet', name: 'Eden', habitable: true, habitabilityScore: 0.86, inhabited: true, resourceAmounts: { metals: 8.2, ice: 40.4 } }] },
    { id: 'rock-home-1', type: 'asteroid', name: 'Asteroid Ceres-7', mannyMineable: true, motorized: false, resourceTypes: ['metals', 'ice'], resourceAmounts: { metals: 6.4, ice: 3.1 } },
    { id: 'rock-home-2', type: 'asteroid', name: 'Asteroid Vesta-12', mannyMineable: true, motorized: false, resourceTypes: ['carbon_compounds'], resourceAmounts: { carbon_compounds: 4.2 } },
    { id: 'wreck-home', type: 'others_mothership_wreck', name: 'Derelict Others mothership', mannyMineable: true, resourceTypes: ['metals'], resourceAmounts: { metals: 18 } },
  ];
  home.probes = [{ id: 1, name: 'Bob', status: 'idle' }];
  const messages: Record<string, Json[]> = {
    1: [
      { id: 101, status: 'unread', body: 'Bob, Riker here. Picking up strong metal signatures toward 4,2,0. Will report on arrival.', sender: { type: 'probe', id: 2, name: 'Riker' }, sentAt: iso(t0 - 3_600_000) },
      { id: 102, status: 'read', body: 'The Deltans say hi. Also: stop naming asteroids after cartoon characters.', sender: { type: 'probe', id: 3, name: 'Bill' }, sentAt: iso(t0 - 86_400_000) },
    ],
    2: [],
    3: [],
  };
  const alerts: Record<string, Json[]> = {
    1: [{ id: 'a-1', type: 'task_completed', title: 'Crafting complete', message: 'Guppy finished a Steel plate.', severity: 'info', status: 'unread', createdAt: iso(t0 - 900_000) }],
    2: [{ id: 'a-2', type: 'low_fuel', title: 'Deuterium below 50%', message: 'Consider refuelling at the next ice-bearing body.', severity: 'warning', status: 'unread', createdAt: iso(t0 - 1_800_000) }],
    3: [],
  };
  const damage: Record<string, Json[]> = {
    1: [],
    2: [{ id: 'd-1', title: 'Micrometeoroid impact', message: 'Hull integrity reduced by 4% during cruise.', severity: 'warning', status: 'unread', createdAt: iso(t0 - 7_200_000) }],
    3: [],
  };
  const logbook: Record<string, Json[]> = {
    1: [
      { id: 1, title: 'Day one', content: 'Woke up in a box. Apparently I am a spaceship now. Coffee is not an option.', sortOrder: 1, createdAt: iso(t0 - 864e5 * 30), updatedAt: iso(t0 - 864e5 * 30) },
      { id: 2, title: 'Eridani survey', content: 'Eden (planet c) shows a habitability score of 0.86 with a primitive native population. Non-interference protocol in effect.', sortOrder: 2, createdAt: iso(t0 - 864e5 * 4), updatedAt: iso(t0 - 864e5 * 2) },
    ],
    2: [],
    3: [],
  };
  let nextId = 1000;
  // A simple sliding-window limiter so rate-limit handling can be exercised.
  const LIMIT = 90;
  let windowStart = now(),
    used = 0;

  function mkProbe(id: number, name: string, rel: C, status: string, integrity: number, deut: number): Json {
    const cont = (cid: string, label: string, capacity: number, kind = 'container') => ({ id: cid, kind, label, capacity, usedCapacity: 0, freeCapacity: capacity, rules: { priority: [], exclusion: [], strictExclusion: [] } });
    const containers = [cont(`core-${id}`, 'Core storage', 2, 'probe'), cont(`cargo-${id}a`, 'Cargo A', 1.5)];
    const items: Json[] = [];
    const add = (type: string, n: number, name?: string) => {
      for (let i = 0; i < n; i++) items.push({ id: `${type}-${id}-${i}-${Math.random().toString(36).slice(2, 6)}`, type, name: name ?? type.replaceAll('_', ' '), containerSpace: 0.01, currentTask: null, container: { id: containers[i % 2].id, label: containers[i % 2].label } });
    };
    add('steel_bar', 5);
    add('steel_plate', 3);
    add('electric_motor', 2);
    add('battery_pack', 1);
    if (id === 1) add('atomic_3d_printer', 1, 'Atomic 3D printer');
    const stocks = [
      { id: 'metals', type: 'metals', name: 'Metals', amount: 0, containers: [{ container: { id: containers[0].id, label: containers[0].label }, amount: 0.42 }, { container: { id: containers[1].id, label: containers[1].label }, amount: 0.18 }] },
      { id: 'ice', type: 'ice', name: 'Ice', amount: 0, containers: [{ container: { id: containers[0].id, label: containers[0].label }, amount: 0.21 }] },
      { id: 'carbon_compounds', type: 'carbon_compounds', name: 'Carbon compounds', amount: 0, containers: [{ container: { id: containers[1].id, label: containers[1].label }, amount: 0.15 }] },
    ];
    return { id, name, status, isReachable: true, sector: { relative: rel }, systems: { integrityPercent: integrity }, fuel: { deuterium: deut, deuteriumCapacity: 100 }, movement: null, inventory: { capacity: 3.5, usedCapacity: 0, freeCapacity: 3.5, containers, items, resourceStocks: stocks, externalTanks: [] } };
  }

  function mkManny(id: string, name: string): Json {
    return { id, name, currentTask: null, canReceiveOrders: true, location: { type: 'probe' }, task: null, taskProgressPercent: null, taskStartTime: null, taskEstimatedEndTime: null, cargo: null };
  }

  function recount(p: Json) {
    const inv = p.inventory;
    if (!inv) return;
    for (const s of inv.resourceStocks) s.amount = Math.round(s.containers.reduce((n: number, c: Json) => n + c.amount, 0) * 1e6) / 1e6;
    for (const c of inv.containers) {
      c.usedCapacity = Math.round((inv.items.filter((i: Json) => i.container?.id === c.id).reduce((n: number, i: Json) => n + (i.containerSpace ?? 0), 0) + inv.resourceStocks.reduce((n: number, s: Json) => n + s.containers.filter((x: Json) => x.container.id === c.id).reduce((a: number, x: Json) => a + x.amount, 0), 0)) * 1e6) / 1e6;
      c.freeCapacity = Math.round((c.capacity - c.usedCapacity) * 1e6) / 1e6;
    }
    inv.capacity = inv.containers.reduce((n: number, c: Json) => n + c.capacity, 0);
    inv.usedCapacity = Math.round(inv.containers.reduce((n: number, c: Json) => n + c.usedCapacity, 0) * 1e6) / 1e6;
    inv.freeCapacity = Math.round((inv.capacity - inv.usedCapacity) * 1e6) / 1e6;
  }
  probes.slice(0, 3).forEach(recount);

  function tick() {
    const t = now();
    for (let i = tasks.length - 1; i >= 0; i--) {
      const task = tasks[i];
      const m = crew[task.probeId]?.find((x) => x.id === task.mannyId);
      if (!m) {
        tasks.splice(i, 1);
        continue;
      }
      if (t >= task.end) {
        tasks.splice(i, 1);
        task.done();
        Object.assign(m, { currentTask: null, canReceiveOrders: true, task: null, taskProgressPercent: null, taskStartTime: null, taskEstimatedEndTime: null, location: { type: 'probe' } });
      } else m.taskProgressPercent = Math.round(((t - task.start) / (task.end - task.start)) * 100);
    }
    for (const p of probes) {
      const mv = p.movement;
      if (!mv || !mv.arrivalAt) continue;
      const arrive = Date.parse(mv.arrivalAt),
        depart = Date.parse(mv.departedAt);
      const frac = (t - depart) / (arrive - depart);
      if (t >= arrive) {
        p.sector = { relative: mv.target };
        p.status = 'idle';
        p.movement = null;
        const v = (visited[p.id] ??= []);
        const hit = v.find((x) => x.relativeCoordinates.x === mv.target.x && x.relativeCoordinates.y === mv.target.y && x.relativeCoordinates.z === mv.target.z);
        if (hit) {
          hit.lastVisitedAt = iso(t);
          hit.visitCount++;
        } else v.push({ relativeCoordinates: mv.target, firstVisitedAt: iso(t), lastVisitedAt: iso(t), visitCount: 1 });
        (alerts[p.id] ??= []).unshift({ id: `a-${nextId++}`, type: 'arrival', title: 'Arrived at destination', message: `${p.name} arrived at ${mv.target.x}, ${mv.target.y}, ${mv.target.z}.`, severity: 'info', status: 'unread', createdAt: iso(t) });
      } else p.status = frac < 0.1 ? 'preparing' : frac < 0.3 ? 'accelerating' : frac < 0.8 ? 'cruising' : 'decelerating';
    }
    for (const p of probes) if (p.sector && (p.status === 'idle' || p.status === 'orbiting')) {
      const s = sectorFor(p.sector.relative);
      s.probes = probes.filter((q) => q.sector && q.sector.relative.x === p.sector.relative.x && q.sector.relative.y === p.sector.relative.y && q.sector.relative.z === p.sector.relative.z && q.status !== 'out_of_scut_range').map((q) => ({ id: q.id, name: q.name, status: q.status }));
    }
  }

  const ok = (data: unknown, status = 200) => ({ status, data });
  const fail = (status: number, code: string, message: string) => ({ status, data: { error: { code, message } } });

  function assign(probeId: string, mannyId: string, task: string, seconds: number, done: () => void, extra: Json = {}) {
    const m = crew[probeId]?.find((x) => x.id === mannyId);
    if (!m) return fail(404, 'manny_not_found', 'No such Manny on this probe.');
    if (!m.canReceiveOrders || m.currentTask) return fail(409, 'manny_busy', `${m.name} is busy (${m.currentTask}).`);
    const start = now(),
      end = start + (seconds * 1000) / speed;
    Object.assign(m, { currentTask: task, canReceiveOrders: false, taskStartTime: iso(start), taskEstimatedEndTime: iso(end), taskProgressPercent: 0, task: extra, location: extra.exterior ? { type: 'sector', sector: { relative: probes.find((p) => String(p.id) === probeId)!.sector.relative } } : { type: 'probe' } });
    tasks.push({ mannyId, probeId, task, start, end, done });
    return ok({ manny: clone(m) }, 202);
  }

  function takeItems(p: Json, type: string, n: number) {
    const inv = p.inventory;
    for (let i = 0; i < n; i++) {
      const idx = inv.items.findIndex((x: Json) => x.type === type && !x.currentTask);
      if (idx < 0) return false;
      inv.items.splice(idx, 1);
    }
    return true;
  }
  function takeResource(p: Json, type: string, amount: number) {
    const s = p.inventory.resourceStocks.find((x: Json) => x.type === type);
    if (!s) return false;
    let left = amount;
    for (const c of s.containers) {
      const take = Math.min(c.amount, left);
      c.amount = Math.round((c.amount - take) * 1e6) / 1e6;
      left -= take;
    }
    recount(p);
    return left < 1e-9;
  }
  /** Consume ingredients, preparing missing parts from their own recipes like the game does. */
  function consumeRecursive(p: Json, ing: Json[], depth = 0): boolean {
    if (depth > 8) return false;
    for (const i of ing) {
      if (i.unit !== 'item') {
        if (!takeResource(p, i.type, i.quantity)) return false;
        continue;
      }
      for (let n = 0; n < i.quantity; n++) {
        if (takeItems(p, i.type, 1)) continue;
        const sub = RECIPES.find((r) => r.output.type === i.type && r.craftableBy.includes('manny'));
        if (!sub || !consumeRecursive(p, sub.ingredients, depth + 1)) return false;
      }
    }
    return true;
  }
  /** Atomically consume (or leave the inventory untouched). */
  function consume(p: Json, ing: Json[]) {
    const snapshot = clone(p.inventory);
    if (consumeRecursive(p, ing)) {
      recount(p);
      return true;
    }
    p.inventory = snapshot;
    return false;
  }
  function addItem(p: Json, type: string, space = 0.01) {
    const c = p.inventory.containers.find((x: Json) => x.freeCapacity >= space) ?? p.inventory.containers[0];
    p.inventory.items.push({ id: `${type}-${nextId++}`, type, name: type.replaceAll('_', ' '), containerSpace: space, currentTask: null, container: { id: c.id, label: c.label } });
    recount(p);
  }

  function route(method: string, path: string, body: Json | undefined) {
    const url = new URL(path, 'https://sim.local');
    const q = url.searchParams;
    const seg = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
    if (method === 'GET' && url.pathname === '/api/version') return ok({ version: 'simulator-2.0' });
    if (method === 'GET' && url.pathname === '/api/crafting-recipes') return ok({ recipes: clone(RECIPES) });
    if (method === 'GET' && url.pathname === '/api/probes') return ok({ defaultProbeId: 1, probes: probes.map((p) => ({ id: p.id, name: p.name, status: p.status, isReachable: p.isReachable !== false, sector: p.sector })) });
    if (method === 'GET' && url.pathname === '/api/probe') return ok({ probe: clone(probes[0]) });
    if (method === 'GET' && url.pathname === '/api/visited-sectors') return ok({ visitedSectors: Object.entries(visited).flatMap(([pid, list]) => list.map((v) => ({ ...v, probeId: Number(pid) }))) });
    if (method === 'GET' && url.pathname === '/api/sector') {
      const c = { x: Number(q.get('x')), y: Number(q.get('y')), z: Number(q.get('z')) };
      const s = clone(sectorFor(c));
      s.knowledgeLevel = 'estimated';
      s.estimatedObjects = { star: s.objects.some((o: Json) => o.type === 'solar_system'), asteroidCount: s.objects.filter((o: Json) => o.type === 'asteroid').length };
      return ok({ sector: s });
    }
    if (seg[0] !== 'probe') return fail(404, 'not_found', 'Unknown endpoint');
    const pid = seg[1];
    const p = probes.find((x) => String(x.id) === pid);
    if (!p) return fail(404, 'probe_not_found', 'Probe not found.');
    const rest = seg.slice(2);
    const r = rest.join('/');
    if (p.status === 'out_of_scut_range' && r) return fail(403, 'out_of_scut_range', 'This probe is outside SCUT coverage.');
    if (!r) {
      if (method === 'GET') return ok({ probe: p.status === 'out_of_scut_range' ? { id: p.id, name: p.name, status: p.status, sector: p.sector } : clone(p) });
      if (method === 'PATCH') {
        if (body?.name) p.name = body.name;
        return ok({ defaultProbeId: 1, probes: probes.map((x) => ({ id: x.id, name: x.name, status: x.status })) });
      }
    }
    if (r === 'mannies' && method === 'GET') return ok({ mannies: clone(crew[pid] ?? []) });
    if (r === 'sector' && method === 'GET') {
      if (['accelerating', 'cruising', 'decelerating'].includes(p.status)) return fail(400, 'sensors_unavailable', 'External sensors are unavailable at the current speed.');
      return ok({ sector: clone(sectorFor(p.sector.relative)), inventory: clone(p.inventory) });
    }
    if (r === 'sector/autonomous-units' && method === 'GET') return ok({ units: [], nextCursor: null });
    if (r === 'visited-sectors' && method === 'GET') return ok({ visitedSectors: clone(visited[pid] ?? []) });
    if (r === 'storage-containers' && method === 'GET') return ok({ containers: clone(p.inventory.containers) });
    if (rest[0] === 'storage-containers' && rest[1]) {
      const c = p.inventory.containers.find((x: Json) => x.id === rest[1]);
      if (!c) return fail(404, 'container_not_found', 'Container not found.');
      if (method === 'GET') return ok({ container: clone(c), items: clone(p.inventory.items.filter((i: Json) => i.container?.id === c.id)) });
      if (method === 'PATCH' && rest[2] === 'rules') {
        c.rules = { priority: body?.priority ?? c.rules.priority, exclusion: body?.exclusion ?? c.rules.exclusion, strictExclusion: body?.strictExclusion ?? c.rules.strictExclusion };
        return ok({ container: clone(c) });
      }
      if (method === 'PATCH') {
        c.label = body?.label ?? c.label;
        return ok({ container: clone(c) });
      }
      if (method === 'POST') return ok({ reassigned: 0 });
    }
    if (r === 'storage-moves' && method === 'POST') {
      const to = p.inventory.containers.find((x: Json) => x.id === body?.toContainerId);
      if (!to) return fail(404, 'container_not_found', 'Destination container not found.');
      return assign(pid, body!.actorMannyId, 'moving_stockage', 15, () => {
        if (body!.kind === 'resource') {
          const s = p.inventory.resourceStocks.find((x: Json) => x.type === body!.resourceType);
          const from = s?.containers.find((x: Json) => x.container.id === body!.fromContainerId);
          if (s && from) {
            const amt = Math.min(from.amount, body!.amount ?? 0);
            from.amount -= amt;
            let dest = s.containers.find((x: Json) => x.container.id === to.id);
            if (!dest) s.containers.push((dest = { container: { id: to.id, label: to.label }, amount: 0 }));
            dest.amount += amt;
          }
        } else for (const iid of body!.itemIds ?? (body!.itemId ? [body!.itemId] : [])) {
          const it = p.inventory.items.find((x: Json) => x.id === iid);
          if (it) it.container = { id: to.id, label: to.label };
        }
        recount(p);
      });
    }
    if (rest[0] === 'inventory' && rest[2] === 'jettison' && method === 'POST') {
      const itemId = rest[1];
      const s = p.inventory.resourceStocks.find((x: Json) => x.type === itemId || x.id === itemId);
      if (s) {
        takeResource(p, s.type, body?.amount ?? s.amount);
        return ok({ inventory: clone(p.inventory), jettisoned: { type: s.type, amount: body?.amount } });
      }
      const idx = p.inventory.items.findIndex((x: Json) => x.id === itemId);
      if (idx < 0) return fail(404, 'item_not_found', 'Item not found.');
      const [gone] = p.inventory.items.splice(idx, 1);
      recount(p);
      return ok({ inventory: clone(p.inventory), jettisoned: gone });
    }
    if (rest[0] === 'inventory' && method === 'GET') {
      const it = p.inventory.items.find((x: Json) => x.id === rest[1]);
      return it ? ok({ item: clone(it) }) : fail(404, 'item_not_found', 'Item not found.');
    }
    if (r.startsWith('probe-improvements-available')) return ok({ improvements: clone(IMPROVEMENTS) });
    if (r === 'move' && method === 'POST') {
      if (p.movement) return fail(409, 'already_moving', 'The probe is already moving.');
      const target = body!.target;
      const from = p.sector.relative;
      const d = Math.max(Math.abs(target.x - from.x), Math.abs(target.y - from.y), Math.abs(target.z - from.z), (Math.abs(target.x - from.x) + Math.abs(target.y - from.y) + Math.abs(target.z - from.z)) / 2);
      if (!d) return fail(422, 'same_sector', 'The probe is already in that sector.');
      const cost = d * 3;
      if (p.fuel.deuterium < cost) return fail(422, 'insufficient_deuterium', `Needs ${cost}% deuterium.`);
      p.fuel.deuterium -= cost;
      const t = now();
      p.movement = { status: 'preparing', origin: from, target, departedAt: iso(t), arrivalAt: iso(t + (d * 40_000) / speed), estimatedVelocityC: 0.78 };
      p.status = 'preparing';
      return ok({ movement: clone(p.movement) }, 202);
    }
    if (r === 'move' && method === 'DELETE') {
      if (p.status !== 'preparing') return fail(409, 'not_preparing', 'Movement can only be cancelled during preparation.');
      p.movement = null;
      p.status = 'idle';
      return ok(null, 204);
    }
    if (r === 'mannies/tasks' && method === 'POST') {
      const results = (body?.tasks ?? []).map((t: Json) => simulateMannyAction(p, pid, t.mannyId, t.task, t.payload ?? {}));
      const failed = results.find((x: Json) => x.status >= 300);
      if (failed) return failed;
      return ok({ results: results.map((x: Json) => x.data) }, 202);
    }
    if (rest[0] === 'mannies' && rest[1]) {
      const m = crew[pid]?.find((x) => x.id === rest[1]);
      if (!m) return fail(404, 'manny_not_found', 'Manny not found.');
      if (!rest[2] && method === 'GET') return ok({ manny: clone(m) });
      if (!rest[2] && method === 'PATCH') {
        m.name = body?.name ?? m.name;
        return ok({ manny: clone(m) });
      }
      if (rest[2] && method === 'POST') return simulateMannyAction(p, pid, m.id, rest[2], body ?? {});
    }
    if (r === 'atomic-printer/craft' && method === 'POST') {
      const recipe = RECIPES.find((x) => x.id === body?.recipe);
      if (!recipe) return fail(422, 'unknown_recipe', 'Unknown recipe.');
      if (!p.inventory.items.some((i: Json) => i.type === 'atomic_3d_printer')) return fail(422, 'no_printer', 'No atomic printer aboard.');
      const helper = crew[pid].find((m) => m.canReceiveOrders && !m.currentTask);
      if (!helper) return fail(409, 'no_assistant', 'The printer needs an idle Manny.');
      if (!consume(p, recipe.ingredients)) return fail(422, 'missing_ingredients', 'Missing ingredients.');
      return assign(pid, helper.id, 'assisting_printer', recipe.durationSeconds, () => addItem(p, recipe.output.type, recipe.output.containerSpace));
    }
    if (r.startsWith('messages') && method === 'GET' && rest.length === 1) {
      const list = (messages[pid] ?? []).filter((m) => q.get('status') !== 'unread' || m.status === 'unread');
      const off = Number(q.get('offset') ?? 0),
        lim = Number(q.get('limit') ?? 20);
      return ok({ messages: clone(list.slice(off, off + lim)), pagination: { total: list.length, offset: off, limit: lim, hasMore: off + lim < list.length } });
    }
    if (r === 'messages' && method === 'POST') {
      const target = body?.recipient;
      const msg = { id: nextId++, status: 'unread', body: body!.body, sender: { type: 'probe', id: p.id, name: p.name }, sentAt: iso(now()) };
      if (target?.type === 'probe' && messages[String(target.id)]) messages[String(target.id)].unshift(msg);
      return ok({ message: { ...msg, status: 'sent' } }, 201);
    }
    if (rest[0] === 'messages' && rest[2] === 'read' && method === 'PATCH') {
      const m = messages[pid]?.find((x) => String(x.id) === rest[1]);
      if (!m) return fail(404, 'not_found', 'Message not found.');
      m.status = 'read';
      return ok({ message: clone(m) });
    }
    for (const [key, store] of [['alerts', alerts], ['damage-warnings', damage]] as const) {
      if (r === key && method === 'GET') {
        const list = (store[pid] ?? []).filter((a) => q.get('status') !== 'unread' || a.status === 'unread');
        return ok(key === 'alerts' ? { alerts: clone(list) } : { damageWarnings: clone(list) });
      }
      if (rest[0] === key && rest[1]) {
        const list = store[pid] ?? [];
        const i = list.findIndex((a) => a.id === rest[1]);
        if (i < 0) return fail(404, 'not_found', 'Not found.');
        if (method === 'PATCH') {
          list[i].status = 'read';
          return ok({ alert: clone(list[i]) });
        }
        if (method === 'DELETE') {
          list.splice(i, 1);
          return ok(null, 204);
        }
      }
    }
    if (r === 'logbook-pages' && method === 'GET') {
      const list = logbook[pid] ?? [];
      return ok({ pages: list.map(({ content: _c, ...x }) => clone(x)), pagination: { total: list.length, hasMore: false } });
    }
    if (r === 'logbook-page' && method === 'POST') {
      const page = { id: nextId++, title: body!.title, content: body!.content, sortOrder: (logbook[pid]?.length ?? 0) + 1, createdAt: iso(now()), updatedAt: iso(now()) };
      (logbook[pid] ??= []).push(page);
      return ok({ page: clone(page) }, 201);
    }
    if (rest[0] === 'logbook-page' && rest[1]) {
      const list = logbook[pid] ?? [];
      const i = list.findIndex((x) => String(x.id) === rest[1]);
      if (i < 0) return fail(404, 'not_found', 'Page not found.');
      if (method === 'GET') return ok({ page: clone(list[i]) });
      if (method === 'PATCH') {
        Object.assign(list[i], body, { updatedAt: iso(now()) });
        return ok({ page: clone(list[i]) });
      }
      if (method === 'DELETE') {
        list.splice(i, 1);
        return ok(null, 204);
      }
    }
    if (rest[0] === 'scut-network') return ok({ network: { id: rest[1], name: 'Eridani Relay Net', relays: [] } });
    if (rest[0] === 'missiles') return fail(422, 'no_missile', 'No missile in the simulator.');
    if (rest[0] === 'asteroid-trajectories') return fail(404, 'not_found', 'No trajectory.');
    return fail(501, 'not_simulated', `The simulator does not implement ${method} ${url.pathname}.`);
  }

  function simulateMannyAction(p: Json, pid: string, mannyId: string, action: string, body: Json) {
    const sector = sectorFor(p.sector.relative);
    const object = (id: string) => sector.objects.find((o: Json) => o.id === id);
    switch (action) {
      case 'craft': {
        const recipe = RECIPES.find((x) => x.id === body.recipe);
        if (!recipe || !recipe.craftableBy.includes('manny')) return fail(422, 'unknown_recipe', 'Unknown or printer-only recipe.');
        if (!consume(p, recipe.ingredients)) return fail(422, 'missing_ingredients', `Missing ingredients for ${recipe.name}.`);
        return assign(pid, mannyId, 'crafting', recipe.durationSeconds, () => addItem(p, recipe.output.type, recipe.output.containerSpace), { recipe: recipe.id });
      }
      case 'mine': {
        const o = object(body.objectId);
        if (!o || !o.mannyMineable) return fail(422, 'not_mineable', 'That object cannot be mined.');
        const res: string[] = body.resources ?? o.resourceTypes;
        const amount = Math.min(body.targetAmount ?? 0.1, p.inventory.freeCapacity);
        if (amount <= 0) return fail(422, 'cargo_full', 'No free cargo capacity.');
        return assign(pid, mannyId, 'mining', 20 + amount * 100, () => {
          const each = amount / res.length;
          for (const k of res) {
            const available = Math.min(each, o.resourceAmounts?.[k] ?? 0);
            if (o.resourceAmounts) o.resourceAmounts[k] = Math.round((o.resourceAmounts[k] - available) * 1e6) / 1e6;
            let s = p.inventory.resourceStocks.find((x: Json) => x.type === k);
            if (!s) p.inventory.resourceStocks.push((s = { id: k, type: k, name: k.replaceAll('_', ' '), amount: 0, containers: [] }));
            const cid = body.targetContainerId ?? p.inventory.containers[0].id;
            let c = s.containers.find((x: Json) => x.container.id === cid);
            if (!c) s.containers.push((c = { container: { id: cid }, amount: 0 }));
            c.amount = Math.round((c.amount + available) * 1e6) / 1e6;
          }
          recount(p);
        }, { objectId: o.id, resourceTypes: res, targetAmount: amount, exterior: true, target: { name: o.name } });
      }
      case 'repair': {
        const pct = body.integrityPercent ?? 5;
        if (p.systems.integrityPercent >= 100) return fail(422, 'full_integrity', 'Integrity is already 100%.');
        if (!takeResource(p, 'metals', pct * 0.01)) return fail(422, 'missing_ingredients', 'Not enough metals to repair.');
        return assign(pid, mannyId, 'repair', 10 + pct * 3, () => (p.systems.integrityPercent = Math.min(100, p.systems.integrityPercent + pct)));
      }
      case 'improve-probe': {
        const imp = IMPROVEMENTS.find((x) => x.id === body.improvement);
        if (!imp || !imp.available || imp.done) return fail(422, 'unavailable', 'That improvement is not available.');
        if (!consume(p, imp.ingredients)) return fail(422, 'missing_ingredients', 'Missing parts for this improvement.');
        return assign(pid, mannyId, 'improving_probe', imp.durationSeconds, () => (imp.done = true));
      }
      case 'refill-deuterium-tank': {
        if (!takeResource(p, 'ice', 0.1)) return fail(422, 'missing_ingredients', 'Needs 0.1 ice.');
        return assign(pid, mannyId, 'refilling_deuterium', 30, () => (p.fuel.deuterium = Math.min(p.fuel.deuteriumCapacity ?? 100, p.fuel.deuterium + 10)));
      }
      case 'recall': {
        const m = crew[pid].find((x) => x.id === mannyId)!;
        const i = tasks.findIndex((t) => t.mannyId === mannyId);
        if (i >= 0) tasks.splice(i, 1);
        Object.assign(m, { currentTask: 'returning', canReceiveOrders: false, taskProgressPercent: 0 });
        const start = now();
        tasks.push({ mannyId, probeId: pid, task: 'returning', start, end: start + 8000 / speed, done: () => undefined });
        return ok({ manny: clone(m) }, 202);
      }
      case 'salvage':
      case 'inspect-sector-object': {
        const o = object(body.objectId);
        if (!o) return fail(404, 'object_not_found', 'Object not found in this sector.');
        return assign(pid, mannyId, action === 'salvage' ? 'salvaging' : 'inspecting', 25, () => {
          if (action === 'inspect-sector-object') o.inspected = true;
        }, { objectId: o.id, exterior: true, target: { name: o.name } });
      }
      case 'motorize-asteroid':
      case 'refuel-motorized-asteroid':
      case 'sculpt-duck-asteroid': {
        const o = object(body.objectId);
        if (!o || o.type !== 'asteroid') return fail(422, 'not_asteroid', 'Choose an asteroid.');
        return assign(pid, mannyId, action.replaceAll('-', '_'), 40, () => {
          if (action === 'motorize-asteroid') Object.assign(o, { motorized: true, motorFuelStatus: 'full' });
          if (action === 'sculpt-duck-asteroid') o.name = `${o.name} (duck)`;
        }, { objectId: o.id, exterior: true, target: { name: o.name } });
      }
      case 'install-bookmark':
        return assign(pid, mannyId, 'installing_bookmark', 30, () => undefined, { objectId: body.objectId, exterior: true });
      default:
        return assign(pid, mannyId, action.replaceAll('-', '_'), 20, () => undefined);
    }
  }

  return {
    kind: 'simulator',
    async send(request: WireRequest, signal: AbortSignal): Promise<WireResponse> {
      await new Promise((r) => setTimeout(r, 60 + Math.random() * 140));
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const t = now();
      if (t - windowStart > 60_000) {
        windowStart = t;
        used = 0;
      }
      used++;
      const reset = String(Math.ceil((windowStart + 60_000) / 1000));
      if (used > LIMIT) return { status: 429, data: { error: { code: 'rate_limited', message: 'Too many requests.' } }, headers: { retryAfter: String(Math.ceil((windowStart + 60_000 - t) / 1000)), remaining: '0', reset, limit: String(LIMIT) } };
      tick();
      const r = route(request.method, request.path, request.body as Json | undefined);
      return { status: r.status, data: r.data, headers: { retryAfter: null, remaining: String(Math.max(0, LIMIT - used)), reset, limit: String(LIMIT) } };
    },
  };
}
