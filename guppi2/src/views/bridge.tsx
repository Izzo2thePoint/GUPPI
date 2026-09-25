import { Bell, Bot, Boxes, Compass, Crown, Droplets, Gauge, Hammer, MessagesSquare, Radar, RefreshCw, ShieldCheck, Workflow, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useGame } from '@/state/session';
import { keys, useAction, useAlerts, useMannies, useMessages, useProbe, useSector, useSelectedProbeId } from '@/state/hooks';
import { useNav } from '@/state/nav';
import { useJobs, activeJobs } from '@/state/jobs';
import { isMoving, label, mannyReady } from '@/core/models';
import { fmtNumber, fmtPercent, fmtRelative, fmtDuration, secondsUntil } from '@/core/format';
import { formatCoord } from '@/core/lattice';
import { GameApiError } from '@/core/errors';
import { Badge, Button, Card, CardBody, CardHeader, Empty, ErrorNote, Skeleton } from '@/components/ui/primitives';
import { Meter, Ring, Stat } from '@/components/ui/data';
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

  if (probe.isLoading) return <BridgeSkeleton />;
  if (probe.error) return <Page><ErrorNote error={probe.error} onRetry={() => probe.refetch()} /></Page>;
  if (!p) return null;

  return (
    <Page>
      {/* Hero */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--accent)_22%,transparent),transparent)]" />
        <div className="relative grid gap-6 p-6 xl:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ProbeStatus status={p.status} />
              {p.isDefault && (
                <Badge tone="accent">
                  <Crown className="h-3 w-3" /> Default
                </Badge>
              )}
              <span className="num text-xs text-ink-3">Probe #{p.id}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <h1 className="truncate text-[32px] font-semibold tracking-[-0.03em]">{p.name}</h1>
              <RenameButton current={p.name} title="Rename probe" onSave={(n) => rename.mutateAsync(n)} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-3">
              <span>
                Sector <span className="num text-ink-2">{formatCoord(p.sector)}</span>
              </span>
              {sector.data?.sector?.objects.length ? <span>{sector.data.sector.objects.length} contacts nearby</span> : null}
              <span>Updated {fmtRelative(probe.dataUpdatedAt)}</span>
            </div>
            {p.movement && isMoving(p) && (
              <div className="mt-5 max-w-xl">
                <MovementPanel movement={p.movement} status={p.status} />
                {p.status === 'preparing' && (
                  <Button size="sm" variant="danger" className="mt-3" icon={<XCircle className="h-3.5 w-3.5" />} loading={cancelMove.isPending} onClick={() => cancelMove.mutate(undefined)}>
                    Cancel jump
                  </Button>
                )}
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={<Compass className="h-3.5 w-3.5" />} onClick={() => go('navigation')}>
                Plot a jump
              </Button>
              <Button size="sm" icon={<Hammer className="h-3.5 w-3.5" />} onClick={() => go('workshop')}>
                Craft
              </Button>
              <Button size="sm" icon={<Radar className="h-3.5 w-3.5" />} onClick={() => go('navigation')}>
                Sensors
              </Button>
              {!p.isDefault && (
                <Button size="sm" variant="ghost" icon={<Crown className="h-3.5 w-3.5" />} loading={makeDefault.isPending} onClick={() => makeDefault.mutate(undefined)}>
                  Make default
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(probeId) })}>
                Refresh
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Gauge3 label="Integrity" value={p.integrity} icon={<ShieldCheck className="h-3.5 w-3.5" />} />
            <Gauge3 label="Deuterium" value={p.deuteriumCapacity ? ((p.deuterium ?? 0) / p.deuteriumCapacity) * 100 : p.deuterium} icon={<Droplets className="h-3.5 w-3.5" />} />
            <Gauge3 label="Cargo used" value={cargoPct} icon={<Boxes className="h-3.5 w-3.5" />} invert />
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Crew ready" icon={<Bot />} value={crew.data ? `${ready} / ${mannies.length}` : '—'} sub={`${busy} on task`} tone={ready ? 'ok' : 'neutral'} />
        <Stat label="Cargo" icon={<Boxes />} value={inv?.capacity !== undefined ? `${fmtNumber(inv.usedCapacity)} / ${fmtNumber(inv.capacity)}` : '—'} sub={`${fmtNumber(inv?.freeCapacity)} free · ${inv?.items.length ?? 0} items`} />
        <Stat label="Comms" icon={<MessagesSquare />} value={(unread.data?.total ?? 0) + unreadAlerts.length} sub={`${unread.data?.total ?? 0} messages · ${unreadAlerts.length} alerts`} tone={(unread.data?.total ?? 0) + unreadAlerts.length ? 'accent' : undefined} />
        <Stat label="Automation" icon={<Workflow />} value={running.length} sub={running[0]?.name ?? 'Idle'} tone={running.length ? 'accent' : undefined} />
      </div>

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
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-raised text-xs font-semibold text-ink-2">{m.name.slice(0, 2).toUpperCase()}</div>
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
                        <span className="num shrink-0 text-[10px] text-ink-3">{left !== undefined ? fmtDuration(left) : fmtPercent(m.progress)}</span>
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
                {o.mannyMineable && <Badge tone="ok">Mineable</Badge>}
              </div>
            ))}
            {sector.data?.sector && !sector.data.sector.objects.length && <Empty icon={<Radar />} title="Empty space">Nothing detected in this sector.</Empty>}
          </div>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader title="Alerts" subtitle={`${unreadAlerts.length} unread`} icon={<Bell />} actions={<Button size="xs" variant="ghost" onClick={() => go('comms')}>Inbox</Button>} />
          <div className="divide-y divide-line">
            {alerts.data?.slice(0, 6).map((a) => (
              <div key={a.id} className="flex gap-3 px-5 py-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.status === 'unread' ? (a.severity === 'warning' ? 'bg-warn' : a.severity === 'critical' ? 'bg-bad' : 'bg-accent') : 'bg-ink-4'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{a.title}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-ink-4">{fmtRelative(a.createdAt)}</span>
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

function Gauge3({ label: text, value, icon, invert }: { label: string; value?: number; icon: React.ReactNode; invert?: boolean }) {
  const v = value ?? 0;
  const tone = value === undefined ? 'neutral' : invert ? (v > 90 ? 'bad' : v > 70 ? 'warn' : 'accent') : v >= 60 ? 'ok' : v >= 30 ? 'warn' : 'bad';
  return (
    <div className="flex flex-col items-center gap-2">
      <Ring value={value} size={96} stroke={7} tone={tone}>
        <div className="text-center">
          <div className="num text-lg font-semibold">{value === undefined ? '—' : Math.round(v)}</div>
          <div className="text-[9px] uppercase tracking-wider text-ink-4">{value === undefined ? '' : '%'}</div>
        </div>
      </Ring>
      <div className="flex items-center gap-1.5 text-xs text-ink-3">
        {icon}
        {text}
      </div>
    </div>
  );
}

function BridgeSkeleton() {
  return (
    <Page>
      <Skeleton className="h-56 rounded-card" />
      <div className="mt-5 grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <div className="mt-5 grid grid-cols-3 gap-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-card" />)}</div>
    </Page>
  );
}
