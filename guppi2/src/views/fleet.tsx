import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight, Bot, Crown, Droplets, LayoutGrid, List, Orbit, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { useGame, useSession } from '@/state/session';
import { keys, useProbes } from '@/state/hooks';
import { useNav } from '@/state/nav';
import { useSettings } from '@/state/settings';
import { isMoving, isReachable, mannyReady, type Probe } from '@/core/models';
import { formatCoord, hops } from '@/core/lattice';
import { fmtNumber } from '@/core/format';
import { Badge, Button, Card, Empty, ErrorNote, Segmented, Skeleton, cn } from '@/components/ui/primitives';
import { Meter } from '@/components/ui/data';
import { ProbeStatus } from '@/components/bits';
import { MovementPanel, Page, PageHeader } from '@/components/shared';

export default function Fleet() {
  const game = useGame();
  const list = useProbes();
  const select = useSession((s) => s.selectProbe);
  const selected = useSession((s) => s.selectedProbeId);
  const go = useNav((s) => s.go);
  const poll = useSettings((s) => s.pollFleet);
  const [layout, setLayout] = useState<'grid' | 'table'>('grid');
  const probes = list.data ?? [];
  const reachable = probes.filter(isReachable);

  // Detailed telemetry for every reachable probe, refreshed slowly in the background.
  const details = useQueries({
    queries: reachable.map((p) => ({ queryKey: keys.probe(p.id), queryFn: ({ signal }: { signal: AbortSignal }) => game.probe(p.id, { signal }), refetchInterval: poll * 1000, staleTime: 30_000 })),
  });
  const crews = useQueries({
    queries: reachable.map((p) => ({ queryKey: keys.mannies(p.id), queryFn: ({ signal }: { signal: AbortSignal }) => game.mannies(p.id, { signal }), refetchInterval: poll * 1000, staleTime: 30_000 })),
  });
  const detail = (id: string) => details[reachable.findIndex((p) => p.id === id)]?.data;
  const crew = (id: string) => crews[reachable.findIndex((p) => p.id === id)]?.data;
  const home = probes.find((p) => p.id === selected)?.sector;

  const open = (id: string) => {
    select(id);
    go('bridge');
  };

  return (
    <Page>
      <PageHeader
        title="Fleet"
        subtitle={`${probes.length} probes · ${probes.filter((p) => isMoving(p)).length} in transit · ${probes.length - reachable.length} out of contact`}
        actions={
          <>
            <Segmented value={layout} onChange={setLayout} options={[{ value: 'grid', label: <LayoutGrid className="h-3.5 w-3.5" /> }, { value: 'table', label: <List className="h-3.5 w-3.5" /> }]} />
            <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={list.isFetching} onClick={() => list.refetch()}>Refresh</Button>
          </>
        }
      />
      {list.error && <ErrorNote error={list.error} onRetry={() => list.refetch()} />}
      {list.isLoading && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60 rounded-card" />)}</div>}
      {list.data && !probes.length && <Empty icon={<Orbit />} title="No probes" />}

      {layout === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {probes.map((p) => (
            <ProbeCard key={p.id} probe={detail(p.id) ?? p} listed={p} crew={crew(p.id)} selected={p.id === selected} distance={home && p.sector ? hops(home, p.sector) : undefined} onOpen={() => open(p.id)} />
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-4">
                {['Probe', 'Status', 'Sector', 'Integrity', 'Deuterium', 'Cargo', 'Crew', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {probes.map((listed) => {
                const p = detail(listed.id) ?? listed;
                const c = crew(listed.id);
                return (
                  <tr key={p.id} className={cn('hover:bg-white/[0.015]', p.id === selected && 'bg-accent-soft/40')}>
                    <td className="px-4 py-3"><div className="font-medium">{p.name}</div><div className="num text-[11px] text-ink-4">#{p.id}</div></td>
                    <td className="px-4 py-3"><ProbeStatus status={p.status} /></td>
                    <td className="num px-4 py-3 text-ink-2">{formatCoord(p.sector)}</td>
                    <td className="num px-4 py-3">{p.integrity !== undefined ? `${p.integrity}%` : '—'}</td>
                    <td className="num px-4 py-3">{p.deuterium !== undefined ? `${p.deuterium}%` : '—'}</td>
                    <td className="num px-4 py-3">{p.inventory ? `${fmtNumber(p.inventory.usedCapacity)} / ${fmtNumber(p.inventory.capacity)}` : '—'}</td>
                    <td className="num px-4 py-3">{c ? `${c.filter(mannyReady).length}/${c.length}` : '—'}</td>
                    <td className="px-4 py-3 text-right"><Button size="xs" variant="ghost" disabled={!isReachable(listed)} onClick={() => open(p.id)}>Open</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </Page>
  );
}

function ProbeCard({ probe: p, listed, crew, selected, distance, onOpen }: { probe: Probe; listed: Probe; crew?: import('@/core/models').Manny[]; selected: boolean; distance?: number; onOpen: () => void }) {
  const reachable = isReachable(listed);
  const inv = p.inventory;
  return (
    <Card className={cn('flex flex-col', selected && 'shadow-[0_0_0_1px_var(--accent),var(--shadow-card)]', !reachable && 'opacity-70')}>
      <div className="flex items-start gap-3 p-5">
        <div className="relative grid h-11 w-11 place-items-center rounded-xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_30%,transparent),color-mix(in_oklab,var(--accent-2)_30%,transparent))]">
          <Orbit className="h-5 w-5 text-ink" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{p.name}</span>
            {listed.isDefault && <Crown className="h-3.5 w-3.5 text-warn" />}
          </div>
          <div className="num text-xs text-ink-3">
            #{p.id} · {formatCoord(p.sector)}
            {distance !== undefined && distance > 0 && ` · ${distance} hops`}
          </div>
        </div>
        <ProbeStatus status={p.status} />
      </div>
      <div className="flex-1 px-5">
        {!reachable ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong p-3 text-xs text-ink-3">
            <WifiOff className="h-3.5 w-3.5" /> Outside SCUT coverage — only its last position is known.
          </div>
        ) : p.movement && isMoving(p) ? (
          <MovementPanel movement={p.movement} status={p.status} />
        ) : (
          <div className="space-y-3">
            <Line icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Integrity" value={p.integrity} />
            <Line icon={<Droplets className="h-3.5 w-3.5" />} label="Deuterium" value={p.deuterium} />
            {inv?.capacity ? <Line icon={<Orbit className="h-3.5 w-3.5" />} label="Cargo" value={((inv.usedCapacity ?? 0) / inv.capacity) * 100} invert /> : null}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-line px-5 py-3">
        {crew ? (
          <Badge tone={crew.some(mannyReady) ? 'ok' : 'neutral'}>
            <Bot className="h-3 w-3" /> {crew.filter(mannyReady).length}/{crew.length} ready
          </Badge>
        ) : (
          <span className="text-xs text-ink-4">Crew unknown</span>
        )}
        <Button size="xs" variant="ghost" className="ml-auto" disabled={!reachable} onClick={onOpen}>
          Take command <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function Line({ icon, label, value, invert }: { icon: React.ReactNode; label: string; value?: number; invert?: boolean }) {
  const v = value ?? 0;
  const tone = value === undefined ? 'neutral' : invert ? (v > 90 ? 'bad' : v > 70 ? 'warn' : 'accent') : v >= 60 ? 'ok' : v >= 30 ? 'warn' : 'bad';
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-ink-3">{icon}{label}</span>
        <span className="num text-ink-2">{value !== undefined ? `${Math.round(v)}%` : '—'}</span>
      </div>
      <Meter value={value} tone={tone} thin />
    </div>
  );
}
