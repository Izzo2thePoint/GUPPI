import { describe, expect, it } from 'vitest';
import { catalog, compile, ValidationError } from '../src/core/catalog';
import { hops, neighbors, parseCoord, plotCourse, isValidSector } from '../src/core/lattice';
import { planCraft, canCraft } from '../src/core/craft';
import { claimsFor, conflictWith, overlaps, type Job } from '../src/core/claims';
import { normProbe, normManny, normSector, listFrom, normRecipe } from '../src/core/models';

describe('catalog', () => {
  it('contains every documented endpoint with a unique id', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(68);
    expect(new Set(catalog.map((o) => o.id)).size).toBe(catalog.length);
  });

  it('compiles path and query parameters', () => {
    const r = compile({ operation: 'GET /api/probe/{probeId}/messages', params: { probeId: '7', limit: 20, status: 'unread' } });
    expect(r.path).toBe('/api/probe/7/messages?limit=20&status=unread');
    expect(r.method).toBe('GET');
    expect(r.body).toBeUndefined();
  });

  it('rejects unsafe path segments and missing parameters', () => {
    expect(() => compile({ operation: 'GET /api/probe/{probeId}', params: { probeId: '../x' } })).toThrow(ValidationError);
    expect(() => compile({ operation: 'GET /api/probe/{probeId}', params: {} })).toThrow(/probeId is required/);
  });

  it('validates bodies against the schema', () => {
    expect(() =>
      compile({ operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/craft', params: { probeId: '1', mannyId: 'm' }, body: { recipe: 'nope' } }),
    ).toThrow(/choose one of/);
    expect(
      compile({ operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/craft', params: { probeId: '1', mannyId: 'm' }, body: { recipe: 'steel_bar' } }).body,
    ).toEqual({ recipe: 'steel_bar' });
  });

  it('enforces sector parity for moves and observations', () => {
    expect(() => compile({ operation: 'POST /api/probe/{probeId}/move', params: { probeId: '1' }, body: { target: { x: 1, y: 0, z: 0 } } })).toThrow(/even/);
    expect(() => compile({ operation: 'GET /api/sector', params: { x: 1, y: 1, z: 1 } })).toThrow(/even/);
    expect(compile({ operation: 'GET /api/sector', params: { x: 1, y: 1, z: 0 } }).path).toBe('/api/sector?x=1&y=1&z=0');
  });

  it('rejects query values outside documented bounds', () => {
    expect(() => compile({ operation: 'GET /api/probe/{probeId}/messages', params: { probeId: '1', limit: 500 } })).toThrow(/at most 200/);
  });
});

describe('lattice', () => {
  it('has twelve valid neighbours', () => {
    const n = neighbors({ x: 0, y: 0, z: 0 });
    expect(n).toHaveLength(12);
    expect(n.every(isValidSector)).toBe(true);
    expect(n.every((c) => hops({ x: 0, y: 0, z: 0 }, c) === 1)).toBe(true);
  });

  it('parses coordinates with parity validation', () => {
    expect(parseCoord(['2', ' -1', '1'])).toEqual({ x: 2, y: -1, z: 1 });
    expect(() => parseCoord(['1', '0', '0'])).toThrow(/even/);
    expect(() => parseCoord(['a', '0', '0'])).toThrow(/whole numbers/);
  });

  it('plots a course of single hops', () => {
    const from = { x: 0, y: 0, z: 0 },
      to = { x: 6, y: -2, z: 4 };
    const path = plotCourse(from, to);
    expect(path[0]).toEqual(from);
    expect(path.at(-1)).toEqual(to);
    expect(path.length - 1).toBe(hops(from, to));
    for (let i = 1; i < path.length; i++) expect(hops(path[i - 1], path[i])).toBe(1);
  });
});

describe('craft planning', () => {
  const recipes = listFrom(
    {
      recipes: [
        { id: 'steel_bar', durationSeconds: 10, craftableBy: ['manny'], ingredients: [{ type: 'metals', quantity: 0.1, unit: 'earth_container_equivalent' }], output: { type: 'steel_bar' } },
        { id: 'steel_plate', durationSeconds: 20, craftableBy: ['manny'], ingredients: [{ type: 'steel_bar', quantity: 2, unit: 'item' }], output: { type: 'steel_plate' } },
      ],
    },
    'recipes',
    normRecipe,
  );
  const plate = recipes[1];

  it('uses existing parts first and expands the rest', () => {
    const inv = { resourceStocks: [{ id: 'metals', type: 'metals', name: 'Metals', amount: 1, containers: [] }], containers: [], items: [{ id: 'b', type: 'steel_bar', raw: {} }] };
    const plan = planCraft(plate, recipes, inv);
    expect(plan.used).toEqual({ steel_bar: 1 });
    expect(plan.prepare).toEqual({ steel_bar: 1 });
    expect(plan.raw.metals).toBeCloseTo(0.1);
    expect(plan.durationSeconds).toBe(30);
    expect(canCraft(plan, false)).toBe(true);
  });

  it('reports raw shortfalls', () => {
    const plan = planCraft(plate, recipes, { resourceStocks: [], containers: [], items: [] });
    expect(plan.missing.metals).toBeCloseTo(0.2);
    expect(canCraft(plan, true)).toBe(false);
  });
});

describe('claims', () => {
  it('derives claims from commands', () => {
    expect(claimsFor('POST /api/probe/{probeId}/move', {}, { target: {} })).toEqual([{ key: 'helm' }]);
    expect(claimsFor('GET /api/probe/{probeId}/mannies')).toEqual([]);
    const mine = claimsFor('POST /api/probe/{probeId}/mannies/{mannyId}/mine', { mannyId: 'a' }, { objectId: 'rock' });
    expect(mine).toContainEqual({ key: 'manny:a', shared: false });
    expect(mine).toContainEqual({ key: 'asteroid:rock', shared: true });
  });

  it('treats shared claims as compatible and the probe claim as exclusive', () => {
    expect(overlaps({ key: 'asteroid:x', shared: true }, { key: 'asteroid:x', shared: true })).toBe(false);
    expect(overlaps({ key: 'manny:a' }, { key: 'manny:a' })).toBe(true);
    expect(overlaps({ key: 'probe' }, { key: 'manny:b' })).toBe(true);
  });

  it('finds conflicting running jobs on the same probe only', () => {
    const job = { probeId: '1', state: 'running', claims: [{ key: 'manny:a' }] } as Job;
    expect(conflictWith([job], '1', [{ key: 'manny:a' }])).toBe(job);
    expect(conflictWith([job], '2', [{ key: 'manny:a' }])).toBeUndefined();
    expect(conflictWith([{ ...job, state: 'done' }], '1', [{ key: 'manny:a' }])).toBeUndefined();
  });
});

describe('normalizers', () => {
  it('tolerates partial and malformed data', () => {
    expect(normProbe({})).toBeUndefined();
    const p = normProbe({ id: 3, status: 'cruising', sector: { relative: { x: 2, y: 0, z: 0 } }, systems: { integrityPercent: 'bad' } })!;
    expect(p.id).toBe('3');
    expect(p.sector).toEqual({ x: 2, y: 0, z: 0 });
    expect(p.integrity).toBeUndefined();
    expect(normManny({ id: 'm', currentTask: null, canReceiveOrders: true, location: { type: 'probe' } })!.currentTask).toBeNull();
    const s = normSector({ objects: [{ id: 'sys', type: 'solar_system', planets: [{ id: 'p', type: 'planet' }] }, 'junk'] })!;
    expect(s.objects).toHaveLength(1);
    expect(s.objects[0].children[0].id).toBe('p');
  });
});
