import { describe, expect, it } from 'vitest';
import { Scheduler } from '../src/core/scheduler';
import { createSimulator } from '../src/core/simulator/world';
import { createGame } from '../src/core/game';
import { assemblyParts, planAssembly } from '../src/core/assembly';

const game = () => createGame(new Scheduler(createSimulator(), { spacingMs: 0 }));

describe('building a new probe', () => {
  it('lists the parts each model needs (from the catalog)', () => {
    expect(assemblyParts('generic')).toEqual({ deuterium_engine: 1, scut_relay: 1, electric_motor: 5, atomic_printer_part: 2, solar_panel: 4 });
    expect(assemblyParts('deuterium_tanker')).toMatchObject({ steel_plate: 10, linear_actuator: 2, integrated_circuit: 1 });
  });

  it('compares the parts list with what is aboard and plans the shortfall', async () => {
    const g = game();
    const [probe, recipes] = await Promise.all([g.probe('1'), g.recipes()]);
    const plan = planAssembly('generic', probe.inventory, recipes);
    const line = (t: string) => plan.parts.find((p) => p.type === t)!;
    expect(line('solar_panel')).toMatchObject({ need: 4, have: 2, short: 2, craftable: true });
    expect(line('deuterium_engine')).toMatchObject({ need: 1, have: 1, short: 0 });
    expect(line('atomic_printer_part')).toMatchObject({ have: 1, short: 1, printer: true });
    expect(plan.ready).toBe(false);
    expect(plan.containers.empty.map((c) => c.id)).toEqual(['cargo-1b']);
    // The shortfall expands into sub-parts and needs the printer for the printer part.
    expect(plan.build.prepare.solar_panel).toBe(2);
    expect(plan.build.prepare.additional_container).toBe(1);
    expect(plan.build.needsPrinter).toBe(true);
    // Parts already counted as "have" are not spent on sub-parts.
    expect(plan.build.used.deuterium_engine ?? 0).toBe(0);
    expect(plan.progress).toBeGreaterThan(0);
    expect(plan.progress).toBeLessThan(1);
  });
});
