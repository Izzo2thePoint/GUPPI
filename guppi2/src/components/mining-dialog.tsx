import { useMemo, useState } from 'react';
import { Pickaxe } from 'lucide-react';
import { toast } from 'sonner';
import { useGame } from '@/state/session';
import { useMannies, useProbe, useSector } from '@/state/hooks';
import { useNav } from '@/state/nav';
import { DEFAULT_CARGO, localReady, startMiningRun, type MiningRunOptions } from '@/state/automations';
import { detachedContainers, label, miningTargets } from '@/core/models';
import { errorMessage } from '@/core/errors';
import { fmtNumber } from '@/core/format';
import { Button, ErrorNote, Field, Input, Select, cn } from './ui/primitives';
import { Dialog } from './ui/dialog';

/**
 * Configure a mining run: which body, which resources, how much, which Mannies,
 * and where the ore goes. Deuterium always goes straight into the probe tank
 * (0.01 ECE = 1 tank point), which is how probes refuel away from stations.
 */
export function MiningDialog({
  probeId,
  onClose,
  presetObjectId,
  presetResource,
  run,
}: {
  probeId: string;
  onClose: () => void;
  presetObjectId?: string;
  presetResource?: string;
  /** Start the run somewhere else (e.g. on the PC from the phone remote). */
  run?: (options: MiningRunOptions) => Promise<unknown>;
}) {
  const game = useGame();
  const crew = useMannies(probeId);
  const sector = useSector(probeId);
  const probe = useProbe(probeId);
  const targets = useMemo(() => miningTargets(sector.data?.sector), [sector.data]);
  const boxes = detachedContainers(sector.data?.sector);
  const [picked, setObjectId] = useState(presetObjectId ?? '');
  // Sensor data may arrive after the dialog opens: fall back to the first body with the preset resource.
  const target = targets.find((t) => t.id === picked) ?? (presetResource ? targets.find((t) => t.resourceTypes.includes(presetResource)) : undefined);
  const objectId = target?.id ?? picked;
  const [resources, setResources] = useState<string[]>(presetResource ? [presetResource] : []);
  const [chosen, setChosen] = useState<string[]>([]);
  const [total, setTotal] = useState(presetResource === 'deuterium' ? '0.2' : '0.2');
  const [dest, setDest] = useState('');
  const [reserve, setReserve] = useState('0.05');
  const available = (crew.data ?? []).filter((m) => m.canReceiveOrders || m.currentTask);
  const ready = (crew.data ?? []).filter((m) => localReady(m, probe.data?.sector));
  const deuteriumOnly = resources.length === 1 && resources[0] === 'deuterium';
  const selectedResources = resources.length ? resources : (target?.resourceTypes ?? []);
  const mixedDeuterium = selectedResources.includes('deuterium') && selectedResources.length > 1;
  const n = Number(total);
  const loads = Number.isFinite(n) && n > 0 ? Math.ceil(n / DEFAULT_CARGO) : 0;
  const tankRoom = (probe.data?.deuteriumCapacity ?? 100) - (probe.data?.deuterium ?? 0);
  const error = !target
    ? 'Choose a body to mine.'
    : !chosen.length
      ? 'Choose at least one Manny.'
      : !(n > 0)
        ? 'Enter an amount.'
        : mixedDeuterium
          ? 'Mine deuterium on its own so it can go into the tank.'
          : dest && selectedResources.includes('deuterium')
            ? 'Detached containers cannot hold deuterium.'
            : null;

  const start = async () => {
    const options: MiningRunOptions = {
      mannyIds: chosen,
      objectId: target!.id,
      objectName: target!.name,
      resources: selectedResources,
      total: n,
      targetContainerId: dest || undefined,
      stopWhenFreeBelow: Number(reserve) || 0,
    };
    try {
      if (run) await run(options);
      else {
        startMiningRun(game, probeId, options);
        useNav.getState().setJobs(true);
      }
      toast.success('Mining run started', { description: `${loads} load${loads === 1 ? '' : 's'} across ${chosen.length} Manny${chosen.length === 1 ? '' : 's'}.` });
      onClose();
    } catch (e) {
      toast.error('Cannot start mining', { description: errorMessage(e) });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      wide
      icon={<Pickaxe />}
      title={presetResource === 'deuterium' ? 'Refuel by mining deuterium' : 'Mining run'}
      description="GUPPI splits the amount into cargo-sized loads (0.05 ECE per Manny trip), sends each Manny out again as soon as it docks, and stops before cargo overflows."
      footer={
        <>
          {error && <span className="mr-auto text-xs text-warn">{error}</span>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!error} onClick={() => void start()}>
            Start mining
          </Button>
        </>
      }
    >
      {sector.error && <ErrorNote error={sector.error} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Body to mine" className="col-span-full" hint={targets.length ? `${targets.length} mineable bodies in this sector` : 'No mineable bodies reported in this sector.'}>
          <Select value={objectId} onChange={(e) => (setObjectId(e.target.value), setResources(presetResource ? [presetResource] : []))}>
            <option value="">Choose…</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.parent ? ` (${t.parent})` : ''} · {label(t.type)} · {t.resourceTypes.map((r) => `${label(r)}${t.resourceAmounts?.[r] !== undefined ? ` ${fmtNumber(t.resourceAmounts[r], 3)}` : ''}`).join(', ')}
              </option>
            ))}
          </Select>
        </Field>
        {target && (
          <Field group label="Resources" className="col-span-full" hint={resources.length ? undefined : 'None selected = every resource on this body.'}>
            <div className="flex flex-wrap gap-1.5">
              {target.resourceTypes.map((r) => {
                const on = resources.includes(r);
                return (
                  <button key={r} type="button" onClick={() => setResources(on ? resources.filter((x) => x !== r) : [...resources, r])} className={cn('h-7 rounded-lg border px-2.5 text-xs', on ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line-strong text-ink-3')}>
                    {label(r)} {target.resourceAmounts?.[r] !== undefined && <span className="num text-ink-4">{fmtNumber(target.resourceAmounts[r], 3)}</span>}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Field group label="Mannies" className="col-span-full" hint={`${ready.length} ready now. Busy Mannies join as soon as they are free.`}>
          <div className="flex flex-wrap gap-1.5">
            {available.map((m) => {
              const on = chosen.includes(m.id);
              return (
                <button key={m.id} type="button" onClick={() => setChosen(on ? chosen.filter((x) => x !== m.id) : [...chosen, m.id])} className={cn('h-7 rounded-lg border px-2.5 text-xs', on ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line-strong text-ink-3')}>
                  {m.name}
                  {!ready.some((r) => r.id === m.id) && <span className="text-ink-4"> · busy</span>}
                </button>
              );
            })}
          </div>
        </Field>
        <Field
          label={deuteriumOnly ? 'Deuterium to mine (ECE)' : 'Total to mine (ECE)'}
          hint={deuteriumOnly ? `= ${Math.round(n * 100) || 0} tank points · room in tank: ${fmtNumber(tankRoom, 1)} points · ${loads} loads` : `${loads} load${loads === 1 ? '' : 's'} of up to ${DEFAULT_CARGO} ECE`}
        >
          <Input className="num" value={total} onChange={(e) => setTotal(e.target.value)} />
        </Field>
        <Field label="Deliver to" hint={deuteriumOnly ? 'Deuterium always goes into the probe tank.' : boxes.length ? undefined : 'Detach a container to create an outpost store.'}>
          <Select value={dest} onChange={(e) => setDest(e.target.value)} disabled={deuteriumOnly}>
            <option value="">Probe {deuteriumOnly ? 'tank' : 'cargo'}</option>
            {boxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · detached{typeof b.raw.freeCapacity === 'number' ? ` · ${fmtNumber(b.raw.freeCapacity, 3)} free` : ''}
              </option>
            ))}
          </Select>
        </Field>
        {!deuteriumOnly && !dest && (
          <Field label="Stop when probe free cargo drops to (ECE)">
            <Input className="num" value={reserve} onChange={(e) => setReserve(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
