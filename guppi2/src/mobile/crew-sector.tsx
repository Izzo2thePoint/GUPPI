import { useMemo, useState } from 'react';
import { ChevronRight, Gauge, MapPin, Pickaxe, Radar, RotateCcw, Send } from 'lucide-react';
import { useGame } from '@/state/session';
import { keys, useAction, useMannies, useNow, useSector, useSelectedProbeId } from '@/state/hooks';
import { hasRefuelStation, label, mannyReady, miningTargets, scutRelays, type Manny, type SectorObject } from '@/core/models';
import { fmtDuration, fmtPercent, secondsUntil } from '@/core/format';
import { formatCoord } from '@/core/lattice';
import { GameApiError } from '@/core/errors';
import { ObjectIcon, objectTone, taskTone } from '@/components/bits';
import { Fields, factChips } from '@/components/observation';
import { OrderDialog } from '@/components/order-dialog';
import { MiningDialog } from '@/components/mining-dialog';
import { Badge, Button, Empty, ErrorNote, Skeleton, cn } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { Meter } from '@/components/ui/data';
import { useRunner } from './connection';

export function CrewScreen() {
  const probeId = useSelectedProbeId();
  const crew = useMannies(probeId);
  const [picked, setPicked] = useState<Manny | null>(null);
  const [order, setOrder] = useState<Manny | null>(null);
  const list = crew.data ?? [];
  return (
    <div className="space-y-2 p-4">
      <div className="px-1 pb-1 text-sm text-ink-3">
        {list.filter(mannyReady).length} ready · {list.filter((m) => m.currentTask).length} on task · {list.filter((m) => m.locationType && m.locationType !== 'probe').length} outside
      </div>
      {crew.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
      {crew.error && <ErrorNote error={crew.error} onRetry={() => crew.refetch()} />}
      {list.map((m) => (
        <MannyRow key={m.id} manny={m} onClick={() => setPicked(m)} />
      ))}
      {crew.data && !list.length && <Empty title="No Mannies aboard" />}
      {picked && <MannySheet manny={picked} probeId={probeId} onClose={() => setPicked(null)} onOrder={() => (setOrder(picked), setPicked(null))} />}
      {order && <OrderDialog open onOpenChange={(v) => !v && setOrder(null)} probeId={probeId} mannies={[order]} />}
    </div>
  );
}

function MannyRow({ manny: m, onClick }: { manny: Manny; onClick: () => void }) {
  const now = useNow(1000);
  const left = secondsUntil(m.taskEnd, now);
  const outside = m.locationType && m.locationType !== 'probe';
  return (
    <button onClick={onClick} className="surface flex w-full items-center gap-3 rounded-2xl p-4 text-left active:scale-[0.99]">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-raised text-sm font-bold text-ink-2">{m.name.slice(0, 2).toUpperCase()}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{m.name}</span>
          <Badge tone={taskTone(m.currentTask)} className="ml-auto shrink-0">
            {m.currentTask === null ? 'Ready' : m.currentTask === 'unknown_too_far' ? 'Out of contact' : label(m.currentTask ?? 'unknown')}
          </Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
          <MapPin className="h-3 w-3" />
          {outside ? `Outside · ${formatCoord(m.locationSector)}` : 'Aboard'}
          {m.currentTask && <span className="num ml-auto">{left !== undefined ? fmtDuration(left) : fmtPercent(m.progress)}</span>}
        </div>
        {m.currentTask && m.currentTask !== 'unknown_too_far' && <Meter value={m.progress} className="mt-2" thin />}
      </div>
    </button>
  );
}

function MannySheet({ manny: m, probeId, onClose, onOrder }: { manny: Manny; probeId: string; onClose: () => void; onOrder: () => void }) {
  const game = useGame();
  const outside = m.locationType && m.locationType !== 'probe';
  const recall = useAction(() => game.mannyAction(probeId, m.id, 'recall'), { label: `Recalling ${m.name}…`, success: `${m.name} recalled`, invalidate: [keys.mannies(probeId)] });
  const target = (m.task?.target as { name?: string } | undefined)?.name;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={m.name} description={m.currentTask ? `${label(m.currentTask)}${target ? ` · ${target}` : ''}` : 'Awaiting orders'}>
      <div className="grid gap-2">
        <Button size="lg" variant="primary" icon={<Send className="h-4 w-4" />} disabled={!m.canReceiveOrders} onClick={onOrder}>
          Give an order…
        </Button>
        {outside && (
          <Button size="lg" icon={<RotateCcw className="h-4 w-4" />} loading={recall.isPending} onClick={() => recall.mutate(undefined, { onSuccess: onClose })}>
            Recall to the probe
          </Button>
        )}
        <p className="pt-1 text-center text-xs text-ink-4">{outside ? `Working at ${formatCoord(m.locationSector)}` : 'Aboard the probe'}</p>
      </div>
    </Dialog>
  );
}

// ── Sector ───────────────────────────────────────────────────────────────────

type Row = { o: SectorObject; depth: number };

export function SectorScreen() {
  const probeId = useSelectedProbeId();
  const sector = useSector(probeId);
  const [picked, setPicked] = useState<SectorObject | null>(null);
  const s = sector.data?.sector;
  const mineable = useMemo(() => new Set(miningTargets(s).map((t) => t.id)), [s]);
  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (list: SectorObject[], depth: number) => list.forEach((o) => (out.push({ o, depth }), walk(o.children, depth + 1)));
    walk(s?.objects ?? [], 0);
    return out;
  }, [s]);

  if (sector.isLoading) return <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>;
  if (sector.error)
    return (
      <div className="p-4">
        {sector.error instanceof GameApiError && sector.error.code === 'sensors_unavailable' ? <Empty icon={<Gauge />} title="Sensors offline in transit">{sector.error.message}</Empty> : <ErrorNote error={sector.error} onRetry={() => sector.refetch()} />}
      </div>
    );
  if (!s) return <Empty icon={<Radar />} title="No sensor data" />;

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-1.5 pb-3">
        {s.knowledgeLevel && <Badge tone="accent">{label(s.knowledgeLevel)} scan</Badge>}
        <Badge tone={s.scutCoverage === 'covered' ? 'ok' : 'neutral'}>SCUT {label(s.scutCoverage ?? 'unknown')}</Badge>
        {s.navigationalRisk && <Badge tone={/high|extreme/i.test(s.navigationalRisk) ? 'bad' : 'neutral'}>Risk {label(s.navigationalRisk)}</Badge>}
        <Badge tone={mineable.size ? 'ok' : 'neutral'}>{mineable.size} mineable</Badge>
        {scutRelays(s).length > 0 && <Badge tone="info">Relay</Badge>}
        {hasRefuelStation(s) && <Badge tone="ok">Refuel station</Badge>}
      </div>
      <div className="surface divide-y divide-line overflow-hidden rounded-2xl">
        {rows.map(({ o, depth }) => {
          const chips = factChips(o, 3);
          return (
            <button key={`${o.id}-${depth}`} onClick={() => setPicked(o)} className="flex w-full items-start gap-3 py-3 pr-3 text-left active:bg-raised" style={{ paddingLeft: 14 + depth * 18 }}>
              <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl', objectTone(o.type))}>
                <ObjectIcon type={o.type} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{o.name}</span>
                  {mineable.has(o.id) && <Badge tone="accent" className="shrink-0">Mine</Badge>}
                </span>
                <span className="block truncate text-xs text-ink-3">
                  {label(o.type)}
                  {o.resourceTypes?.length ? ` · ${o.resourceTypes.map((r) => `${label(r)}${o.resourceAmounts?.[r] !== undefined ? ` ${+o.resourceAmounts[r].toFixed(2)}` : ''}`).join(', ')}` : ''}
                </span>
                {chips.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {chips.map((c) => (
                      <span key={c.key} className={cn('rounded-md border px-1.5 py-0.5 text-[12px]', c.tone === 'bad' ? 'border-bad/25 text-bad' : c.tone === 'ok' ? 'border-ok/25 text-ok' : 'border-line text-ink-3')}>
                        {c.text}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-ink-4" />
            </button>
          );
        })}
        {!rows.length && <Empty icon={<Radar />} title="Nothing detected" />}
      </div>
      {picked && <ObjectSheet object={picked} probeId={probeId} canMine={mineable.has(picked.id)} onClose={() => setPicked(null)} />}
    </div>
  );
}

function ObjectSheet({ object: o, probeId, canMine, onClose }: { object: SectorObject; probeId: string; canMine: boolean; onClose: () => void }) {
  const crew = useMannies(probeId);
  const runner = useRunner();
  const [action, setAction] = useState<string | null>(null);
  const ready = (crew.data ?? []).filter(mannyReady);
  if (action === 'mine') return <MiningDialog probeId={probeId} presetObjectId={o.id} onClose={onClose} run={(opts) => runner.miningRun(probeId, opts)} />;
  if (action && ready[0]) return <OrderDialog open onOpenChange={(v) => !v && onClose()} probeId={probeId} mannies={[ready[0]]} initialAction={action} initialBody={{ objectId: o.id }} />;
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      icon={<ObjectIcon type={o.type} />}
      title={o.name}
      description={label(o.type)}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          {canMine && (
            <Button variant="primary" className="col-span-2" icon={<Pickaxe className="h-4 w-4" />} onClick={() => setAction('mine')}>
              Mine…
            </Button>
          )}
          {o.inspectable !== false && (
            <Button disabled={!ready.length} onClick={() => setAction('inspect-sector-object')}>
              Inspect
            </Button>
          )}
          {o.salvageable === true && (
            <Button disabled={!ready.length} onClick={() => setAction('salvage')}>
              Salvage
            </Button>
          )}
        </div>
      }
    >
      {typeof o.raw.summary === 'string' && <p className="mb-3 text-sm text-ink-2">{o.raw.summary}</p>}
      <Fields value={o.raw} skip={['id', 'name', 'summary']} />
    </Dialog>
  );
}
