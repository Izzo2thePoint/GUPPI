import { Bell, Bot, Boxes, Compass, Crown, Droplets, Gauge, Hammer, Radar, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useGame } from '@/state/session';
import { keys, useAction, useAlerts, useMannies, useMessages, useProbe, useSector, useSelectedProbeId } from '@/state/hooks';
import { useNav } from '@/state/nav';
import { useJobs, activeJobs } from '@/state/jobs';
import { isMoving, label, mannyReady, miningTargets } from '@/core/models';
import { fmtNumber, fmtPercent, fmtRelative, fmtDuration, secondsUntil } from '@/core/format';
import { formatCoord } from '@/core/lattice';
import { GameApiError } from '@/core/errors';
import { Badge, Button, Card, CardBody, CardHeader, Empty, ErrorNote, Skeleton } from '@/components/ui/primitives';
import { Meter, Readout } from '@/components/ui/data';
import { ObjectIcon, ProbeStatus, objectTone, taskTone } from '@/components/bits';
import { MovementPanel, Page, RenameButton } from '@/components/shared';

export default function Bridge() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const qc = useQueryClient();
  const probe = useProbe(probeId);
  const crew = useMannies(probeId);
  const sector = useSector(probeId);
  const alerts = useAlerts(probeId);
  const unread = useMessages(probeId, 0, true);
  const jobs = useJobs((s) => s.jobs);
  const go = useNav((s) => s.go);

  const rename = useAction((name: string) => game.updateProbe(probeId, { name }), {
    label: 'Renaming probe…',
    invalidate: [keys.probe(probeId), keys.probes],
  });
  const makeDefault = useAction(() => game.updateProbe(probeId, { isDefault: true }), {
    label: 'Setting default probe…',
    invalidate: [keys.probes, keys.probe(probeId)],
  });
  const cancelMove = useAction(() => game.cancelMove(probeId), {
    label: 'Cancelling jump…',
    success: 'Jump cancelled',
    invalidate: [keys.probe(probeId), keys.probes],
    claim: { operation: 'DELETE /api/probe/{probeId}/move', probeId },
  });

  const p = probe.data;
  const inv = p?.inventory;
  const cargoPct = inv?.capacity ? ((inv.usedCapacity ?? 0) / inv.capacity) * 100 : undefined;
  const mannies = crew.data ?? [];
  const ready = mannies.filter(mannyReady).length;
  const busy = mannies.filter((m) => m.currentTask).length;
  const unreadAlerts = alerts.data?.filter((a) => a.status === 'unread') ?? [];
  const running = activeJobs(jobs).filter((j) => j.probeId === probeId);
  const mineable = new Set(miningTargets(sector.data?.sector).map((t) => t.id));

  if (probe.isLoading) return <BridgeSkeleton />;
  if (probe.error) return <Page><ErrorNote error={probe.error} onRetry={() => probe.refetch()} /></Page>;
  if (!p) return null;

  return (
    <Page>
      {/* Command header: who is in command, where, and the next moves. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[28px] font-semibold leading-tight tracking-[-0.025em]">{p.name}</h1>
            <RenameButton current={p.name} title="Rename probe" onSave={(n) => rename.mutateAsync(n)} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] text-ink-3">
            <ProbeStatus status={p.status} />
            {p.isDefault && (
              <span className="inline-flex items-center gap-1 text-ink-2">
                <Crown className="h-3.5 w-3.5 text-accent" /> Default probe
              </span>
            )}
            <span>
              Sector <span className="mono text-ink-2">{formatCoord(p.sector)}</span>
            </span>
            {sector.data?.sector?.objects.length ? <span>{sector.data.sector.objects.length} contacts</span> : null}
            {running.length > 0 && (
              <button className="text-accent hover:underline" onClick={() => useNav.getState().setJobs(true)}>
                {running.length} job{running.length === 1 ? '' : 's'} running
              </button>
            )}
            <span>Updated {fmtRelative(probe.dataUpdatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(probeId) })}>
            Refresh
          </Button>
          {!p.isDefault && (
            <Button size="sm" variant="ghost" icon={<Crown className="h-3.5 w-3.5" />} loading={makeDefault.isPending} onClick={() => makeDefault.mutate(undefined)}>
              Make default
            </Button>
          )}
          <Button size="sm" icon={<Hammer className="h-3.5 w-3.5" />} onClick={() => go('workshop')}>
            Workshop
          </Button>
          <Button size="sm" variant="primary" icon={<Compass className="h-3.5 w-3.5" />} onClick={() => go('navigation')}>
            Plot a jump
          </Button>
        </div>
      </div>

      {p.movement && isMoving(p) && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <MovementPanel movement={p.movement} status={p.status} />
          </div>
          {p.status === 'preparing' && (
            <Button size="sm" variant="danger" icon={<XCircle className="h-3.5 w-3.5" />} loading={cancelMove.isPending} onClick={() => cancelMove.mutate(undefined)}>
              Cancel jump
            </Button>
          )}
        </div>
      )}

      {/* Instruments: one panel, four readouts. */}
      <Card className="mt-5 grid divide-line sm:grid-cols-2 sm:divide-x xl:grid-cols-4">
        <Readout className="p-5" size="lg" label="Hull integrity" icon={<ShieldCheck />} value={p.integrity} unit="%" />
        <Readout
          className="p-5"
          size="lg"
          label="Deuterium"
          icon={<Droplets />}
          value={p.deuteriumCapacity ? ((p.deuterium ?? 0) / p.deuteriumCapacity) * 100 : p.deuterium}
          display={p.deuterium !== undefined ? fmtNumber(p.deuterium, 1) : undefined}
          unit={p.deuteriumCapacity ? ` / ${p.deuteriumCapacity}` : '%'}
        />
        <Readout
          className="p-5"
          size="lg"
          label="Cargo"
          icon={<Boxes />}
          value={cargoPct}
          invert
          display={inv?.capacity !== undefined ? fmtNumber(inv.usedCapacity, 2) : undefined}
          unit={inv?.capacity !== undefined ? ` / ${fmtNumber(inv.capacity, 2)} ECE` : undefined}
        />
        <Readout
          className="p-5"
          size="lg"
          label="Crew ready"
          icon={<Bot />}
          value={mannies.length ? (ready / mannies.length) * 100 : undefined}
          tone={ready ? 'ok' : 'neutral'}
          display={crew.data ? String(ready) : undefined}
          unit={crew.data ? ` of ${mannies.length}${busy ? ` · ${busy} busy` : ''}` : undefined}
        />
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {/* Crew */}
        <Card>
          <CardHeader title="Crew activity" subtitle={`${mannies.length} Mannies`} icon={<Bot />} actions={<Button size="xs" variant="ghost" onClick={() => go('crew')}>Manage</Button>} />
          <div className="divide-y divide-line">
            {crew.isLoading && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>}
            {crew.error && <div className="p-4"><ErrorNote error={crew.error} /></div>}
            {mannies.slice(0, 6).map((m) => {
              const left = secondsUntil(m.taskEnd);
              return (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="grid h-8 w-8 place-items-center rounded-full border border-line-strong bg-raised text-[12px] font-semibold text-ink-2">{m.name.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{m.name}</span>
                      <Badge tone={taskTone(m.currentTask)} className="ml-auto">
                        {m.currentTask === null ? 'Ready' : label(m.currentTask ?? 'unknown')}
                      </Badge>
                    </div>
                    {m.currentTask && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Meter value={m.progress} thin />
                        <span className="num shrink-0 text-[12px] text-ink-3">{left !== undefined ? fmtDuration(left) : fmtPercent(m.progress)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {crew.data && !mannies.length && <Empty icon={<Bot />} title="No Mannies aboard" />}
          </div>
        </Card>

        {/* Sector */}
        <Card>
          <CardHeader title="Local sector" subtitle={sector.data?.sector?.knowledgeLevel ? `${label(sector.data.sector.knowledgeLevel)} scan` : 'External sensors'} icon={<Radar />} actions={<Button size="xs" variant="ghost" onClick={() => go('navigation')}>Open</Button>} />
          <div className="divide-y divide-line">
            {sector.isLoading && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>}
            {isMoving(p) && <Empty icon={<Gauge />} title="Sensors offline in transit">External sensors return once the probe slows down.</Empty>}
            {sector.error && (
              <div className="p-4">
                {sector.error instanceof GameApiError && sector.error.code === 'sensors_unavailable' ? (
                  <Empty icon={<Gauge />} title="Sensors unavailable">{sector.error.message}</Empty>
                ) : (
                  <ErrorNote error={sector.error} onRetry={() => sector.refetch()} />
                )}
              </div>
            )}
            {sector.data?.sector?.objects.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`grid h-8 w-8 place-items-center rounded-lg ${objectTone(o.type)}`}>
                  <ObjectIcon type={o.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{o.name}</div>
                  <div className="truncate text-xs text-ink-3">
                    {label(o.type)}
                    {o.children.length ? ` · ${o.children.length} bodies` : ''}
                    {o.resourceTypes?.length ? ` · ${o.resourceTypes.map(label).join(', ')}` : ''}
                  </div>
                </div>
                {(mineable.has(o.id) || o.children.some((c) => mineable.has(c.id))) && <Badge tone="ok">Mineable</Badge>}
              </div>
            ))}
            {sector.data?.sector && !sector.data.sector.objects.length && <Empty icon={<Radar />} title="Empty space">Nothing detected in this sector.</Empty>}
          </div>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader title="Alerts" subtitle={`${unreadAlerts.length} unread alert${unreadAlerts.length === 1 ? '' : 's'} · ${unread.data?.total ?? 0} unread message${unread.data?.total === 1 ? '' : 's'}`} icon={<Bell />} actions={<Button size="xs" variant="ghost" onClick={() => go('comms')}>Inbox</Button>} />
          <div className="divide-y divide-line">
            {alerts.data?.slice(0, 6).map((a) => (
              <div key={a.id} className="flex gap-3 px-5 py-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.status === 'unread' ? (a.severity === 'warning' ? 'bg-warn' : a.severity === 'critical' ? 'bg-bad' : 'bg-accent') : 'bg-ink-4'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{a.title}</span>
                    <span className="ml-auto shrink-0 text-[12px] text-ink-4">{fmtRelative(a.createdAt)}</span>
                  </div>
                  {a.message && <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-3">{a.message}</div>}
                </div>
              </div>
            ))}
            {alerts.data && !alerts.data.length && <Empty icon={<Bell />} title="All quiet">No alerts for this probe.</Empty>}
            {alerts.error && <div className="p-4"><ErrorNote error={alerts.error} /></div>}
          </div>
        </Card>
      </div>

      {inv && inv.resourceStocks.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Resources" icon={<Boxes />} actions={<Button size="xs" variant="ghost" onClick={() => go('inventory')}>Inventory</Button>} />
          <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {inv.resourceStocks.map((r) => (
              <div key={r.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink-2">{r.name}</span>
                  <span className="num font-medium">{fmtNumber(r.amount, 3)}</span>
                </div>
                <Meter value={r.amount} max={Math.max(inv.capacity ?? 1, 0.0001)} className="mt-2" />
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </Page>
  );
}

function BridgeSkeleton() {
  return (
    <Page>
      <Skeleton className="h-16 w-80" />
      <Skeleton className="mt-5 h-24 rounded-card" />
      <div className="mt-5 grid grid-cols-3 gap-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-card" />)}</div>
    </Page>
  );
}
