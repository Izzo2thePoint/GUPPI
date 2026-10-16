import { describe, expect, it } from 'vitest';
import { normSector } from '../src/core/models';
import { Scheduler } from '../src/core/scheduler';
import { createSimulator } from '../src/core/simulator/world';
import { createGame } from '../src/core/game';
import { archiveSector, summarize, useArchive } from '../src/state/archive';

(globalThis as { localStorage?: unknown }).localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

/** A detailed reading in the shape GUPPI 1 saw from the live game. */
const detailed = normSector({
  relativeCoordinates: { x: 2, y: 0, z: 0 },
  knowledgeLevel: 'detailed',
  dataFreshness: 'live',
  scutCoverageStatus: 'covered',
  scutNetworks: [{ id: 1, name: 'Home net' }],
  navigationalRisk: 'low',
  objects: [
    {
      id: 'sys',
      type: 'solar_system',
      name: 'Fixture stellar system',
      stars: [{ name: 'Fixture primary', type: 'star', massSolar: 1.25 }],
      planets: [
        { id: 'p1', name: 'Fixture ocean world', type: 'planet', habitable: true, habitabilityScore: 0.86, inhabited: true },
        { id: 'p2', name: 'Fixture gas giant', type: 'planet', habitable: false, habitabilityScore: 0 },
      ],
      minableTargets: [{ id: 'p2', name: 'Fixture gas giant', type: 'planet', resourceTypes: ['deuterium'], resourceAmounts: { deuterium: 12 } }],
    },
    { id: 'rock', type: 'asteroid', name: 'Rock', mannyMineable: true, resourceTypes: ['metals'], resourceAmounts: { metals: 3 } },
    { id: 'station', type: 'deuterium_refuel_station', name: 'Depot' },
  ],
})!;

describe('sector summaries', () => {
  it('reads habitability, hazards, SCUT, refuel and mineable bodies from a real-shaped reading', () => {
    const s = summarize({ x: 2, y: 0, z: 0 }, detailed);
    expect(s.stars).toBe(1); // the system, not system + its star
    expect(s.planets).toBe(2);
    expect(s.asteroids).toBe(1);
    expect(s.habitable).toBe(1);
    expect(s.inhabited).toBe(1);
    expect(s.danger).toBe(false);
    expect(s.scut).toBe(true);
    expect(s.refuel).toBe(true);
    expect(s.mineable).toBe(2);
    expect(s.names).toEqual(['Fixture stellar system']);
    expect(s.resources.sort()).toEqual(['deuterium', 'metals']);
    expect(s.estimated).toBeUndefined();
  });

  it('flags hazards the way GUPPI 1 did: black holes, extreme bodies and risk readings', () => {
    const risk = normSector({ navigationalRisk: 'high', objects: [{ id: 'a', type: 'solar_system', name: 'A' }] })!;
    expect(summarize({ x: 0, y: 0, z: 2 }, risk).danger).toBe(true);
    const hole = normSector({ navigationalRisk: 'low', objects: [{ id: 'b', type: 'black_hole', name: 'Maw' }] })!;
    expect(summarize({ x: 0, y: 0, z: 2 }, hole).danger).toBe(true);
    const calm = normSector({ navigationalRisk: 'moderate', objects: [{ id: 'c', type: 'dust_cloud', name: 'Haze', dangerLevel: 'low' }] })!;
    expect(summarize({ x: 0, y: 0, z: 2 }, calm).danger).toBe(false);
    expect(summarize({ x: 0, y: 0, z: 2 }, calm).risk).toBe('moderate');
  });

  it('marks passive estimates and keeps their signals', () => {
    const est = normSector({ knowledgeLevel: 'estimated', dataFreshness: 'passive_scan', objects: [], estimatedObjects: { star: true, asteroidCount: 3, dangerEstimate: 'extreme' } })!;
    const s = summarize({ x: 1, y: 1, z: 0 }, est);
    expect(s.estimated).toBe(true);
    expect(s.stars).toBe(1);
    expect(s.asteroids).toBe(3);
    expect(s.danger).toBe(true);
  });

  it('never lets an estimate overwrite a real scan of the same sector', () => {
    useArchive.getState().clear();
    const c = { x: 2, y: 0, z: 0 };
    archiveSector(detailed, c);
    expect(useArchive.getState().sectors['2,0,0'].habitable).toBe(1);
    const est = normSector({ knowledgeLevel: 'estimated', objects: [], estimatedObjects: { star: true } })!;
    archiveSector(est, c);
    expect(useArchive.getState().sectors['2,0,0'].habitable).toBe(1);
    expect(useArchive.getState().sectors['2,0,0'].estimated).toBeUndefined();
    // A real scan does replace an estimate.
    archiveSector(est, { x: 4, y: 0, z: 0 });
    expect(useArchive.getState().sectors['4,0,0'].estimated).toBe(true);
    archiveSector({ ...detailed, coord: undefined }, { x: 4, y: 0, z: 0 });
    expect(useArchive.getState().sectors['4,0,0'].estimated).toBeUndefined();
    // A reading that states its own coordinates is filed there, whatever the caller assumed.
    archiveSector(detailed, { x: 6, y: 0, z: 0 });
    expect(useArchive.getState().sectors['6,0,0']).toBeUndefined();
  });

  it('archives a local reading from the simulator with its coordinates', async () => {
    useArchive.getState().clear();
    const game = createGame(new Scheduler(createSimulator()));
    const { sector } = await game.sector('1');
    archiveSector(sector, { x: 0, y: 0, z: 0 });
    const s = useArchive.getState().sectors['0,0,0'];
    expect(s).toBeDefined();
    expect(s.stars).toBeGreaterThan(0);
    expect(s.habitable).toBeGreaterThan(0);
    expect(s.refuel).toBe(true);
  });
});
