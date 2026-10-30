import { describe, expect, it } from 'vitest';
import { Scheduler } from '../src/core/scheduler';
import { createSimulator } from '../src/core/simulator/world';
import { createGame } from '../src/core/game';
import { contacts, missiles, normSector } from '../src/core/models';

const until = async (fn: () => boolean | Promise<boolean>, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('tactical models', () => {
  const s = normSector({
    relativeCoordinates: { x: 0, y: 0, z: 0 },
    probes: [
      { id: 1, name: 'Bob', status: 'idle' },
      { id: 9, name: 'Wanderer', status: 'idle', systems: { integrityPercent: 88 } },
      { id: 3, name: 'Bill', status: 'idle' },
    ],
    objects: [
      { id: 'sys', type: 'solar_system', name: 'Sol' },
      { id: 'ship-1', type: 'others_standard_ship', name: 'Sentinel', integrity: 73 },
      { id: 'wreck-1', type: 'others_mothership_wreck', name: 'Derelict', mannyMineable: true },
      { id: 'msl-1', type: 'missile', name: 'Missile', status: 'in_flight', launcherId: 'ship-1', launcherName: 'Sentinel', targetId: 1, targetName: 'Bob', targetsCurrentProbe: true, impactAt: '2030-01-01T00:00:00Z' },
      { id: 'msl-2', type: 'missile', status: 'in_flight', source: { id: 'ship-1', name: 'Sentinel' }, target: { id: 9, name: 'Wanderer' }, etaSeconds: 40 },
    ],
  })!;

  it('lists every other ship, tells yours from other players and Others, and skips wrecks', () => {
    const list = contacts(s, '1', ['1', '3']);
    expect(list.map((c) => [c.id, c.kind])).toEqual([
      ['9', 'probe'],
      ['3', 'own'],
      ['ship-1', 'others'],
    ]);
    expect(list.find((c) => c.id === '9')!.integrity).toBe(88);
    expect(list.find((c) => c.id === 'ship-1')!.hostile).toBe(true);
  });

  it('reads missiles whichever way the launcher and target are named', () => {
    const list = missiles(s, '1');
    expect(list).toHaveLength(2);
    const [atMe, atOther] = list;
    expect(atMe.launcherId).toBe('ship-1');
    expect(atMe.targetId).toBe('1');
    expect(atMe.targetsCurrentProbe).toBe(true);
    expect(atOther.launcherId).toBe('ship-1');
    expect(atOther.launcherName).toBe('Sentinel');
    expect(atOther.targetId).toBe('9');
    expect(atOther.targetName).toBe('Wanderer');
    expect(atOther.targetsCurrentProbe).toBe(false);
    expect(atOther.secondsRemaining).toBe(40);
  });
});

describe('tactical in the simulator', () => {
  it('shows the Others sentinel firing, and fires a missile that destroys it', async () => {
    const game = createGame(new Scheduler(createSimulator({ speed: 200 }), { spacingMs: 0 }));
    // The sentinel shoots at Bob soon after the universe starts.
    await until(async () => missiles((await game.sector('1')).sector, '1').some((m) => m.targetsCurrentProbe), 20_000);
    const before = (await game.sector('1')).sector;
    const inbound = missiles(before, '1').find((m) => m.targetsCurrentProbe)!;
    expect(inbound.launcherId).toBe('ship-sentinel');
    expect(contacts(before, '1', ['1']).map((c) => c.id).sort()).toEqual(['9', 'ship-sentinel']);

    // Fire back with Guppy, no missile named: the first aboard is used.
    const r = (await game.igniteMissile('1', 'm-1a', { targetId: 'ship-sentinel' })) as { missile?: { id: string; status: string } };
    expect(r.missile?.status).toBe('preparing');
    const crew = await game.mannies('1');
    expect(crew.find((m) => m.id === 'm-1a')!.currentTask).toBe('preparing_missile');
    const items = (await game.probe('1')).inventory!.items.filter((i) => i.type === 'missile');
    expect(items).toHaveLength(1);

    // Preparation, flight, then the sentinel is a wreck and the missile record says hit.
    await until(async () => (await game.missile('1', r.missile!.id))?.status === 'hit', 20_000);
    const after = (await game.sector('1')).sector;
    expect(contacts(after, '1', ['1']).map((c) => c.id)).toEqual(['9']);
    expect(after!.objects.some((o) => o.id === 'wreck-ship-sentinel')).toBe(true);
    const alerts = await game.alerts('1');
    expect(alerts.some((a) => /destroyed Others sentinel/.test(a.message ?? ''))).toBe(true);
    // A second missile at a wreck is refused.
    await expect(game.igniteMissile('1', 'm-1b', { targetId: 'wreck-ship-sentinel' })).rejects.toThrow(/cannot be targeted/);
  }, 40_000);
});
