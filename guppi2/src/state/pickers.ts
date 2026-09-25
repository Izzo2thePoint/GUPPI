import { useMemo } from 'react';
import type { Option, Pickers } from '@/components/schema-form';
import { label, type SectorObject } from '@/core/models';
import { formatCoord } from '@/core/lattice';
import { useImprovements, useMannies, useProbe, useProbes, useSector } from './hooks';

export function flattenObjects(objects: SectorObject[]): SectorObject[] {
  return objects.flatMap((o) => [o, ...flattenObjects(o.children)]);
}

/** Live pickers for id-shaped fields, so orders are built from real game data. */
export function usePickers(probeId: string): Pickers {
  const probe = useProbe(probeId);
  const crew = useMannies(probeId);
  const sector = useSector(probeId);
  const probes = useProbes();
  const improvements = useImprovements(probeId);
  return useMemo(() => {
    const inv = probe.data?.inventory;
    const objects = flattenObjects(sector.data?.sector?.objects ?? []);
    const containers: Option[] = (inv?.containers ?? []).map((c) => ({ value: c.id, label: c.label, hint: c.freeCapacity !== undefined ? `${c.freeCapacity} free` : undefined }));
    const mannies: Option[] = (crew.data ?? []).map((m) => ({ value: m.id, label: m.name, hint: m.currentTask === null ? 'ready' : label(m.currentTask ?? 'unknown') }));
    const items: Option[] = (inv?.items ?? []).map((i) => ({ value: i.id, label: i.name ?? label(i.type), hint: label(i.type) }));
    const others: Option[] = (probes.data ?? []).filter((p) => p.id !== probeId).map((p) => ({ value: p.id, label: p.name, hint: `#${p.id} · ${formatCoord(p.sector)}` }));
    return {
      objectId: objects.map((o) => ({ value: o.id, label: o.name, hint: label(o.type) })),
      targetId: objects.map((o) => ({ value: o.id, label: o.name, hint: label(o.type) })),
      planetId: objects.filter((o) => o.type === 'planet').map((o) => ({ value: o.id, label: o.name })),
      containerId: containers,
      toContainerId: containers,
      fromContainerId: containers,
      targetContainerId: containers,
      containerIds: containers,
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
