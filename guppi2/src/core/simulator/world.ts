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

/** Sectors covered by the simulated SCUT network (home and its surroundings). */
const SCUT_NETWORK = { id: 7, name: 'Eridani Relay Net' };
const covered = (c: C) => Math.max(Math.abs(c.x), Math.abs(c.y), Math.abs(c.z)) <= 3;

function planetsFor(prefix: string, name: string, r: () => number): Json[] {
  return Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) => {
    const gas = r() < 0.35;
    const res = gas ? ['deuterium'] : ['metals', 'ice', 'carbon_compounds'].filter(() => r() < 0.6);
    if (!res.length) res.push('metals');
    const moons = r() < 0.5 ? [{ id: `${prefix}-p${i}-m0`, type: 'moon', name: `${name} ${'bcdef'[i]} I`, resourceTypes: ['ice'], resourceAmounts: { ice: Math.round(r() * 200) / 10 } }] : [];
    return {
      id: `${prefix}-p${i}`,
      type: 'planet',
      name: `${name} ${'bcdef'[i]}`,
      planetClass: gas ? 'gas_giant' : r() < 0.5 ? 'rocky' : 'ice_world',
      habitable: !gas && r() < 0.15,
      habitabilityScore: gas ? 0 : Math.round(r() * 100) / 100,
      surfaceTemperatureK: Math.round(60 + r() * 600),
      atmosphere: gas ? { composition: ['hydrogen', 'helium'], pressureAtm: 400 } : { composition: ['nitrogen', 'carbon_dioxide'], pressureAtm: Math.round(r() * 300) / 100 },
      radiationLevel: ['low', 'moderate', 'high'][Math.floor(r() * 3)],
      resourceTypes: res,
      resourceAmounts: Object.fromEntries(res.map((k) => [k, Math.round(r() * 800) / 10 + 1])),
      moons,
    };
  });
}

function sectorAt(c: C): Json {
  const seed = (c.x * 73856093) ^ (c.y * 19349663) ^ (c.z * 83492791);
  const r = rng(seed);
  const objects: Json[] = [];
  const prefix = `${c.x}_${c.y}_${c.z}`;
  if (r() < 0.55) {
    const name = STAR_NAMES[Math.floor(r() * STAR_NAMES.length)] + (c.x || c.y || c.z ? ` ${String.fromCharCode(65 + Math.floor(r() * 8))}` : '');
    const planets = planetsFor(prefix, name, r);
    objects.push({
      id: `system-${prefix}`,
      type: 'solar_system',
      name,
      starCount: 1,
      stars: [{ name: `${name} A`, type: 'star', spectralClass: ['M', 'K', 'G', 'F'][Math.floor(r() * 4)], massSolar: Math.round((0.3 + r() * 1.5) * 100) / 100, temperatureK: Math.round(3000 + r() * 4500) }],
      // Like the game: mineable planets and moons are listed in minableTargets.
      minableTargets: planets.flatMap((p) => [p, ...p.moons]).map(({ moons: _m, ...b }) => b),
      bookmarkTargets: planets.map((p) => ({ id: p.id, type: 'planet', name: p.name })),
      stellarFlareActivity: ['quiet', 'active', 'violent'][Math.floor(r() * 3)],
    });
  }
  const asteroids = Math.floor(r() * 4);
  for (let i = 0; i < asteroids; i++) {
    const res = ['metals', 'ice', 'carbon_compounds'].filter(() => r() < 0.6);
    if (!res.length) res.push('metals');
    objects.push({ id: `rock-${prefix}-${i}`, type: 'asteroid', name: `Asteroid ${String.fromCharCode(945 + i)}-${Math.abs(c.x * 7 + c.y * 3 + c.z) % 97}`, mannyMineable: true, inspectable: true, motorized: false, resourceTypes: res, resourceAmounts: Object.fromEntries(res.map((k) => [k, Math.round(r() * 60) / 10 + 0.5])) });
  }
  if (r() < 0.12) objects.push({ id: `wreck-${prefix}`, type: 'others_mothership_wreck', name: 'Derelict Others mothership', mannyMineable: true, salvageable: true, resourceTypes: ['metals'], resourceAmounts: { metals: 12 } });
  if (r() < 0.1) objects.push({ id: `dust-${prefix}`, type: 'dust_cloud', name: 'Dust cloud', density: Math.round(r() * 1000) / 1e5, sensorInterference: 'moderate' });
  if (r() < 0.15) objects.push({ id: 1000 + (Math.abs(seed) % 900000), type: 'scut_relay', name: 'Dormant SCUT relay', status: 'inactive', summary: 'An inactive relay. A Manny can switch it on with an integrated circuit.' });
  if (r() < 0.1) objects.push({ id: `station-${prefix}`, type: 'deuterium_refuel_station', name: 'Deuterium refuel station', summary: 'Automated depot. A Manny can refill the probe tank here.' });
  if (r() < 0.04) objects.push({ id: `bh-${prefix}`, type: 'black_hole', name: 'Stellar-mass black hole', dangerLevel: 'extreme', gravitationalShear: 'severe' });
  return {
    relativeCoordinates: c,
    knowledgeLevel: 'detailed',
    dataFreshness: 'live',
    navigationalRisk: objects.some((o) => o.type === 'black_hole') ? 'extreme' : objects.some((o) => o.type === 'dust_cloud') ? 'moderate' : 'low',
    scutCoverageStatus: covered(c) ? 'covered' : 'none',
    scutNetworks: covered(c) ? [SCUT_NETWORK] : [],
    objects,
  };
}

type Task = { mannyId: string; probeId: string; task: string; start: number; end: number; done: () => void; stayAt?: C };

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
    {
      id: 'system-home',
      type: 'solar_system',
      name: 'Epsilon Eridani',
      starCount: 1,
      stars: [{ name: 'Epsilon Eridani A', type: 'star', spectralClass: 'K', massSolar: 0.82, temperatureK: 5084 }],
      stellarFlareActivity: 'active',
      minableTargets: [
        { id: 'planet-home-b', type: 'planet', name: 'Epsilon Eridani b', planetClass: 'gas_giant', habitabilityScore: 0, atmosphere: { composition: ['hydrogen', 'helium'], pressureAtm: 400 }, radiationLevel: 'high', resourceTypes: ['deuterium'], resourceAmounts: { deuterium: 42.5 } },
        { id: 'planet-home-c', type: 'planet', name: 'Eden', planetClass: 'ocean_world', habitable: true, habitabilityScore: 0.86, inhabited: true, surfaceTemperatureK: 288, atmosphere: { composition: ['nitrogen', 'oxygen'], pressureAtm: 1.1 }, radiationLevel: 'low', resourceTypes: ['metals', 'ice'], resourceAmounts: { metals: 8.2, ice: 40.4 } },
        { id: 'moon-home-c1', type: 'moon', name: 'Eden I', resourceTypes: ['ice', 'carbon_compounds'], resourceAmounts: { ice: 12.2, carbon_compounds: 3.3 } },
      ],
      bookmarkTargets: [
        { id: 'planet-home-b', type: 'planet', name: 'Epsilon Eridani b' },
        { id: 'planet-home-c', type: 'planet', name: 'Eden' },
      ],
    },
    { id: 'rock-home-1', type: 'asteroid', name: 'Asteroid Ceres-7', mannyMineable: true, inspectable: true, motorized: false, resourceTypes: ['metals', 'ice'], resourceAmounts: { metals: 6.4, ice: 3.1 } },
    { id: 'rock-home-2', type: 'asteroid', name: 'Asteroid Vesta-12', mannyMineable: true, inspectable: true, motorized: false, resourceTypes: ['carbon_compounds'], resourceAmounts: { carbon_compounds: 4.2 } },
    { id: 'wreck-home', type: 'others_mothership_wreck', name: 'Derelict Others mothership', mannyMineable: true, salvageable: true, resourceTypes: ['metals'], resourceAmounts: { metals: 18 } },
    { id: 501, type: 'scut_relay', name: 'Eridani relay', status: 'active', isTransitBeacon: false, coverageRadiusSectors: 3, summary: 'Active relay of the Eridani Relay Net.' },
    { id: 'station-home', type: 'deuterium_refuel_station', name: 'Deuterium refuel station', summary: 'Automated depot. A Manny can refill the probe tank here.' },
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
    const containers = [cont(`core-${id}`, 'Core storage', 2, 'probe'), cont(`cargo-${id}a`, 'Cargo A', 1.5), cont(`cargo-${id}b`, 'Cargo B', 1)];
    const items: Json[] = [];
    const add = (type: string, n: number, name?: string) => {
      for (let i = 0; i < n; i++) items.push({ id: `${type}-${id}-${i}-${Math.random().toString(36).slice(2, 6)}`, type, name: name ?? type.replaceAll('_', ' '), containerSpace: 0.01, currentTask: null, container: { id: containers[i % 2].id, label: containers[i % 2].label } });
    };
    add('steel_bar', 5);
    add('steel_plate', 3);
    add('electric_motor', 2);
    add('battery_pack', 1);
    add('integrated_circuit', 2);
    add('scut_transit_beacon', 1);
    if (id === 1) add('atomic_3d_printer', 1, 'Atomic 3D printer');
    const stocks = [
      { id: 'metals', type: 'metals', name: 'Metals', amount: 0, containers: [{ container: { id: containers[0].id, label: containers[0].label }, amount: 0.42 }, { container: { id: containers[1].id, label: containers[1].label }, amount: 0.18 }] },
      { id: 'ice', type: 'ice', name: 'Ice', amount: 0, containers: [{ container: { id: containers[0].id, label: containers[0].label }, amount: 0.21 }] },
      { id: 'carbon_compounds', type: 'carbon_compounds', name: 'Carbon compounds', amount: 0, containers: [{ container: { id: containers[1].id, label: containers[1].label }, amount: 0.15 }] },
    ];
    return { id, name, status, isReachable: true, sector: { relative: rel }, systems: { integrityPercent: integrity }, fuel: { deuterium: deut, deuteriumCapacity: 100 }, movement: null, inventory: { capacity: 3.5, usedCapacity: 0, freeCapacity: 3.5, containers, items, resourceStocks: stocks, externalTanks: [] } };
  }

  function mkManny(id: string, name: string): Json {
    return { id, name, currentTask: null, canReceiveOrders: true, location: { type: 'probe' }, task: null, taskProgressPercent: null, taskStartTime: null, taskEstimatedEndTime: null, cargo: { capacity: 0.05 } };
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
        // Mannies delivering into a detached container stay out in that sector.
        Object.assign(m, { currentTask: null, canReceiveOrders: true, task: null, taskProgressPercent: null, taskStartTime: null, taskEstimatedEndTime: null, location: task.stayAt ? { type: 'sector', sector: { relative: task.stayAt } } : { type: 'probe' } });
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

  const sameC = (a?: C, b?: C) => !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;

  function assign(probeId: string, mannyId: string, task: string, seconds: number, done: () => void, extra: Json = {}, opts: { at?: C; stay?: boolean; remote?: boolean } = {}) {
    const m = crew[probeId]?.find((x) => x.id === mannyId);
    if (!m) return fail(404, 'manny_not_found', 'No such Manny on this probe.');
    if (!m.canReceiveOrders || m.currentTask) return fail(409, 'manny_busy', `${m.name} is busy (${m.currentTask}).`);
    const probe = probes.find((p) => String(p.id) === probeId)!;
    if (!opts.remote && m.location?.type === 'sector' && !sameC(m.location.sector?.relative, probe.sector.relative))
      return fail(409, 'manny_not_aboard', `${m.name} is in another sector. Only remote mining or recall can reach it.`);
    const at: C = opts.at ?? probe.sector.relative;
    const start = now(),
      end = start + (seconds * 1000) / speed;
    Object.assign(m, { currentTask: task, canReceiveOrders: false, taskStartTime: iso(start), taskEstimatedEndTime: iso(end), taskProgressPercent: 0, task: extra, location: extra.exterior || opts.remote ? { type: 'sector', sector: { relative: at } } : { type: 'probe' } });
    tasks.push({ mannyId, probeId, task, start, end, done, stayAt: opts.stay ? at : undefined });
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
      // Inside SCUT coverage relays give live detail; elsewhere only passive estimates.
      if (covered(c)) return ok({ sector: s });
      const estimate = { relativeCoordinates: c, knowledgeLevel: 'estimated', dataFreshness: 'passive_scan', scutCoverageStatus: 'none', scutNetworks: [], objects: [], estimatedObjects: { star: s.objects.some((o: Json) => o.type === 'solar_system'), asteroidCount: s.objects.filter((o: Json) => o.type === 'asteroid').length, dangerEstimate: s.navigationalRisk } };
      return ok({ sector: estimate });
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
    if (r === 'mannies' && method === 'GET')
      return ok({
        mannies: (crew[pid] ?? []).map((m) => {
          const at = m.location?.sector?.relative;
          // Outside shared SCUT coverage the game cannot report a remote Manny's task.
          if (m.location?.type === 'sector' && at && !sameC(at, p.sector.relative) && !(covered(at) && covered(p.sector.relative)))
            return { ...clone(m), currentTask: 'unknown_too_far', canReceiveOrders: false, task: null };
          return clone(m);
        }),
      });
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
    if (rest[0] === 'scut-network') {
      if (rest[1] !== String(SCUT_NETWORK.id)) return fail(404, 'network_not_found', 'No such SCUT network covering this probe.');
      const relays = [...sectors.entries()].flatMap(([k, sec]) =>
        sec.objects.filter((o: Json) => o.type === 'scut_relay' && o.status === 'active').map((o: Json) => {
          const [x, y, z] = k.split(',').map(Number);
          return { id: o.id, name: o.name, status: o.status, isTransitBeacon: !!o.isTransitBeacon, coverageRadiusSectors: o.coverageRadiusSectors ?? 3, sector: { relative: { x, y, z } } };
        }),
      );
      return ok({ network: { ...SCUT_NETWORK, relayCount: relays.length, coveredSectorCount: 123, relays, probes: probes.filter((q) => q.sector && covered(q.sector.relative)).map((q) => ({ id: q.id, name: q.name })) } });
    }
    if (rest[0] === 'missiles') return fail(422, 'no_missile', 'No missile in the simulator.');
    if (rest[0] === 'asteroid-trajectories') return fail(404, 'not_found', 'No trajectory.');
    return fail(501, 'not_simulated', `The simulator does not implement ${method} ${url.pathname}.`);
  }

  function simulateMannyAction(p: Json, pid: string, mannyId: string, action: string, body: Json) {
    const sector = sectorFor(p.sector.relative);
    const bodiesOf = (sec: Json): Json[] => sec.objects.flatMap((o: Json) => [o, ...(o.minableTargets ?? [])]);
    const object = (id: string) => bodiesOf(sector).find((o: Json) => String(o.id) === String(id));
    switch (action) {
      case 'craft': {
        const recipe = RECIPES.find((x) => x.id === body.recipe);
        if (!recipe || !recipe.craftableBy.includes('manny')) return fail(422, 'unknown_recipe', 'Unknown or printer-only recipe.');
        if (!consume(p, recipe.ingredients)) return fail(422, 'missing_ingredients', `Missing ingredients for ${recipe.name}.`);
        return assign(pid, mannyId, 'crafting', recipe.durationSeconds, () => addItem(p, recipe.output.type, recipe.output.containerSpace), { recipe: recipe.id });
      }
      case 'mine': {
        const m = crew[pid].find((x) => x.id === mannyId);
        if (!m) return fail(404, 'manny_not_found', 'Manny not found.');
        const mAt: C | undefined = m.location?.type === 'sector' ? m.location.sector?.relative : undefined;
        const remote = !!mAt && !sameC(mAt, p.sector.relative);
        if (remote && !(covered(mAt!) && covered(p.sector.relative))) return fail(409, 'scut_not_shared', 'The Manny and the probe are not covered by the same SCUT network.');
        if (remote && !body.targetContainerId) return fail(422, 'target_container_required', 'Remote mining requires a detached container in the Manny sector.');
        const where = remote ? sectorFor(mAt!) : sector;
        const o = bodiesOf(where).find((x) => String(x.id) === String(body.objectId));
        if (!o || !o.resourceTypes?.length) return fail(422, 'not_mineable', 'That object cannot be mined.');
        const res: string[] = body.resources ?? o.resourceTypes;
        if (res.some((k) => !o.resourceTypes.includes(k))) return fail(422, 'resource_unavailable', 'That resource is not present on the target.');
        let amount = Math.min(body.targetAmount ?? 0.05, m.cargo?.capacity ?? 0.05);
        const box = body.targetContainerId ? where.objects.find((x: Json) => x.id === body.targetContainerId && x.type === 'detached_container') : null;
        if (body.targetContainerId && !box) return fail(404, 'container_not_found', 'That detached container is not in the task sector.');
        if (box && res.includes('deuterium')) return fail(422, 'deuterium_not_storable', 'Detached containers cannot receive deuterium.');
        if (box) amount = Math.min(amount, box.freeCapacity);
        else if (!res.every((k) => k === 'deuterium')) amount = Math.min(amount, p.inventory.freeCapacity);
        if (amount <= 1e-9) return fail(422, box ? 'container_full' : 'cargo_full', box ? 'The detached container is full.' : 'No free cargo capacity.');
        const onSameRock = box && box.targetObjectId === o.id;
        return assign(
          pid,
          mannyId,
          'mining',
          (onSameRock ? 8 : 20) + amount * 200,
          () => {
            const each = amount / res.length;
            for (const k of res) {
              const got = Math.min(each, o.resourceAmounts?.[k] ?? 0);
              if (o.resourceAmounts) o.resourceAmounts[k] = Math.round((o.resourceAmounts[k] - got) * 1e6) / 1e6;
              if (k === 'deuterium') {
                // 0.01 ECE of deuterium becomes 1 point in the probe tank.
                p.fuel.deuterium = Math.min(p.fuel.deuteriumCapacity ?? 100, Math.round((p.fuel.deuterium + got * 100) * 100) / 100);
              } else if (box) {
                box.contents[k] = Math.round(((box.contents[k] ?? 0) + got) * 1e6) / 1e6;
                box.usedCapacity = Math.round((box.usedCapacity + got) * 1e6) / 1e6;
                box.freeCapacity = Math.round((box.capacity - box.usedCapacity) * 1e6) / 1e6;
              } else {
                let st = p.inventory.resourceStocks.find((x: Json) => x.type === k);
                if (!st) p.inventory.resourceStocks.push((st = { id: k, type: k, name: k.replaceAll('_', ' '), amount: 0, containers: [] }));
                const cid = p.inventory.containers[0].id;
                let c = st.containers.find((x: Json) => x.container.id === cid);
                if (!c) st.containers.push((c = { container: { id: cid }, amount: 0 }));
                c.amount = Math.round((c.amount + got) * 1e6) / 1e6;
              }
            }
            recount(p);
          },
          { objectId: o.id, resourceTypes: res, targetAmount: +amount.toFixed(6), exterior: true, target: { name: o.name }, ...(box ? { targetContainer: { id: box.id } } : {}) },
          { at: mAt ?? p.sector.relative, stay: !!box, remote },
        );
      }
      case 'detach-storage-container': {
        const idx = p.inventory.containers.findIndex((c: Json) => c.id === body.containerId);
        const c = p.inventory.containers[idx];
        if (!c || c.kind === 'probe') return fail(422, 'not_detachable', 'Only additional containers can be detached.');
        const rock = body.mode === 'hidden_on_asteroid' ? object(body.objectId) : null;
        if (body.mode === 'hidden_on_asteroid' && rock?.type !== 'asteroid') return fail(422, 'not_asteroid', 'Choose an asteroid in this sector.');
        p.inventory.containers.splice(idx, 1);
        p.inventory.items = p.inventory.items.filter((i: Json) => i.container?.id !== c.id);
        for (const st of p.inventory.resourceStocks) st.containers = st.containers.filter((x: Json) => x.container.id !== c.id);
        recount(p);
        const boxId = `detached-${c.id}-${nextId++}`;
        return assign(pid, mannyId, 'detaching_storage_container', 20, () => {
          sector.objects.push({ id: boxId, type: 'detached_container', name: c.label, mode: body.mode, targetObjectId: rock?.id ?? null, capacity: c.capacity, usedCapacity: 0, freeCapacity: c.capacity, contents: {}, originProbeId: p.id });
        }, { containerId: c.id, artificialObjectDetected: { id: boxId }, objectId: rock?.id });
      }
      case 'recover-storage-container': {
        const i = sector.objects.findIndex((o: Json) => o.id === body.objectId && o.type === 'detached_container');
        if (i < 0) return fail(404, 'container_not_found', 'No such detached container in this sector.');
        const box = sector.objects[i];
        return assign(pid, mannyId, 'recovering_storage_container', 25, () => {
          sector.objects.splice(sector.objects.indexOf(box), 1);
          const cid = `cargo-recovered-${nextId++}`;
          p.inventory.containers.push({ id: cid, kind: 'container', label: box.name, capacity: box.capacity, usedCapacity: 0, freeCapacity: box.capacity, rules: { priority: [], exclusion: [], strictExclusion: [] } });
          for (const [k, v] of Object.entries(box.contents as Record<string, number>)) {
            let st = p.inventory.resourceStocks.find((x: Json) => x.type === k);
            if (!st) p.inventory.resourceStocks.push((st = { id: k, type: k, name: k.replaceAll('_', ' '), amount: 0, containers: [] }));
            st.containers.push({ container: { id: cid, label: box.name }, amount: v });
          }
          recount(p);
        }, { objectId: box.id, exterior: true, target: { name: box.name } });
      }
      case 'turn-on-relay':
      case 'install-scut-transit-beacon': {
        const relay = sector.objects.find((o: Json) => o.type === 'scut_relay' && String(o.id) === String(body.relayId));
        if (!relay) return fail(404, 'relay_not_found', 'No such SCUT relay in this sector.');
        if (action === 'turn-on-relay') {
          if (relay.status === 'active') return fail(409, 'relay_active', 'That relay is already active.');
          if (!sector.objects.some((o: Json) => o.type === 'solar_system')) return fail(422, 'no_star', 'The relay needs a local star for solar energy.');
          if (!takeItems(p, 'integrated_circuit', 1)) return fail(422, 'missing_ingredients', 'Needs one integrated circuit.');
        } else {
          if (relay.status !== 'active') return fail(409, 'relay_inactive', 'Turn the relay on first.');
          if (!takeItems(p, 'scut_transit_beacon', 1)) return fail(422, 'missing_ingredients', 'Needs one SCUT transit beacon.');
        }
        recount(p);
        return assign(pid, mannyId, action === 'turn-on-relay' ? 'turning_on_relay' : 'installing_scut_transit_beacon', 30, () => {
          if (action === 'turn-on-relay') Object.assign(relay, { status: 'active', networkName: body.networkName ?? SCUT_NETWORK.name });
          else relay.isTransitBeacon = true;
        }, { relayId: relay.id, exterior: true, target: { name: relay.name } });
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
        if (!sector.objects.some((o: Json) => o.type === 'deuterium_refuel_station'))
          return fail(422, 'no_refuel_station', 'The current sector has no deuterium refuel station.');
        return assign(pid, mannyId, 'refilling_deuterium_tank', 20, () => (p.fuel.deuterium = p.fuel.deuteriumCapacity ?? 100));
      }
      case 'recall': {
        const m = crew[pid].find((x) => x.id === mannyId)!;
        const mAt: C | undefined = m.location?.type === 'sector' ? m.location.sector?.relative : undefined;
        const i = tasks.findIndex((t) => t.mannyId === mannyId);
        if (mAt && !sameC(mAt, p.sector.relative)) {
          // A remote recall cancels the task but leaves the Manny in its own sector.
          if (!(covered(mAt) && covered(p.sector.relative))) return fail(409, 'scut_not_shared', 'Remote recall needs shared SCUT coverage.');
          if (i >= 0) tasks.splice(i, 1);
          Object.assign(m, { currentTask: null, canReceiveOrders: true, task: null, taskProgressPercent: null });
          return ok({ manny: clone(m) }, 202);
        }
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
