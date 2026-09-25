import { useMemo } from 'react';
import type { Option, Pickers } from '@/components/schema-form';
import { allBodies, asteroids, detachedContainers, label, miningTargets, scutRelays, type Sector, type SectorObject } from '@/core/models';
import { formatCoord } from '@/core/lattice';
import { fmtNumber } from '@/core/format';
import { useImprovements, useMannies, useProbe, useProbes, useSector } from './hooks';

/** Flatten a list of bodies including nested ones (planets under systems, etc.). */
export function flattenObjects(objects: SectorObject[]): SectorObject[] {
  return allBodies({ objects } as Sector);
}

const opt = (o: SectorObject, hint?: string): Option => ({ value: o.id, label: o.name, hint: hint ?? label(o.type) });

/** Live pickers for id-shaped fields, so orders are built from real game data. */
export function usePickers(probeId: string): Pickers {
  const probe = useProbe(probeId);
  const crew = useMannies(probeId);
  const sector = useSector(probeId);
  const probes = useProbes();
  const improvements = useImprovements(probeId);
  return useMemo(() => {
    const inv = probe.data?.inventory;
    const s = sector.data?.sector;
    const bodies = allBodies(s);
    const containers: Option[] = (inv?.containers ?? []).map((c) => ({ value: c.id, label: c.label, hint: c.freeCapacity !== undefined ? `${c.freeCapacity} free` : undefined }));
    const extraContainers = containers.filter((c) => inv?.containers.find((x) => x.id === c.value)?.kind !== 'probe');
    const mannies: Option[] = (crew.data ?? []).map((m) => ({ value: m.id, label: m.name, hint: m.currentTask === null ? 'ready' : label(m.currentTask ?? 'unknown') }));
    const items: Option[] = (inv?.items ?? []).map((i) => ({ value: i.id, label: i.name ?? label(i.type), hint: label(i.type) }));
    const others: Option[] = (probes.data ?? []).filter((p) => p.id !== probeId).map((p) => ({ value: p.id, label: p.name, hint: `#${p.id} · ${formatCoord(p.sector)}` }));
    return {
      objectId: bodies.map((o) => opt(o)),
      targetId: bodies.map((o) => opt(o)),
      planetId: bodies.filter((o) => o.type === 'planet').map((o) => opt(o)),
      relayId: scutRelays(s).map((o) => opt(o, String(o.raw.status ?? 'relay'))),
      containerId: containers,
      toContainerId: containers,
      fromContainerId: containers,
      // Mining deliveries go into detached containers out in the sector.
      targetContainerId: detachedContainers(s).map((o) => opt(o, o.raw.freeCapacity !== undefined ? `${fmtNumber(o.raw.freeCapacity as number, 3)} free` : 'detached')),
      containerIds: extraContainers,
      mannyId: mannies,
      actorMannyId: mannies,
      targetMannyId: mannies,
      targetMannyIds: mannies,
      itemId: items,
      itemIds: items,
      missileItemId: items.filter((i) => /missile/i.test(i.hint ?? '')),
      targetProbeId: others,
      recipientProbeId: others,
      improvement: improvements.data?.map((i) => ({ value: i.id, label: i.name, hint: i.done ? 'installed' : i.available ? 'available' : 'locked' })),
    };
  }, [probe.data, crew.data, sector.data, probes.data, improvements.data, probeId]);
}

/** Narrow generic pickers to what makes sense for one Manny order. */
export function pickersForAction(base: Pickers, s: Sector | undefined, action: string, body: Record<string, unknown>): Pickers {
  const out: Pickers = { ...base };
  const bodies = allBodies(s);
  switch (action) {
    case 'mine': {
      const targets = miningTargets(s);
      out.objectId = targets.map((t) => ({
        value: t.id,
        label: t.parent ? `${t.name} (${t.parent})` : t.name,
        hint: t.resourceTypes.map((r) => `${label(r)}${t.resourceAmounts?.[r] !== undefined ? ` ${fmtNumber(t.resourceAmounts[r], 3)}` : ''}`).join(', '),
      }));
      const target = targets.find((t) => t.id === body.objectId);
      if (target) out.resources = target.resourceTypes.map((r) => ({ value: r, label: label(r) }));
      break;
    }
    case 'motorize-asteroid':
    case 'refuel-motorized-asteroid':
    case 'sculpt-duck-asteroid':
      out.objectId = asteroids(s).map((o) => opt(o));
      break;
    case 'detach-storage-container':
      out.objectId = body.mode === 'attach_to_probe' ? base.targetProbeId : asteroids(s).map((o) => opt(o));
      out.containerId = base.containerIds;
      break;
    case 'recover-storage-container':
      out.objectId = detachedContainers(s).map((o) => opt(o));
      break;
    case 'inspect-sector-object': {
      const inspectable = bodies.filter((o) => o.inspectable === true);
      out.objectId = (inspectable.length ? inspectable : bodies).map((o) => opt(o));
      break;
    }
    case 'salvage': {
      const salvageable = bodies.filter((o) => o.salvageable === true);
      out.objectId = (salvageable.length ? salvageable : bodies).map((o) => opt(o));
      break;
    }
    case 'drop-storage-container':
      out.containerId = base.containerIds;
      break;
  }
  return out;
}
