import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight, Bot, Boxes, Crown, Droplets, LayoutGrid, List, Orbit, Palette, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { useGame, useSession } from '@/state/session';
import { keys, useProbes } from '@/state/hooks';
import { useNav } from '@/state/nav';
import { useSettings } from '@/state/settings';
import { isMoving, isReachable, mannyReady, type Manny, type Probe } from '@/core/models';
import { formatCoord, hops } from '@/core/lattice';
import { fmtNumber } from '@/core/format';
import { Button, Card, Empty, ErrorNote, Segmented, Skeleton, cn } from '@/components/ui/primitives';
import { Readout } from '@/components/ui/data';
import { ThemePicker } from '@/components/theme-picker';
import { themeStyle, useProbeTheme, useThemes } from '@/state/theme';
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
              <tr className="border-b border-line text-left text-[12px] font-medium text-ink-3">
                {['Probe', 'Status', 'Sector', 'Integrity', 'Deuterium', 'Cargo', 'Crew', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {probes.map((listed) => {
                const p = detail(listed.id) ?? listed;
                const c = crew(listed.id);
                return (
                  <tr key={p.id} className={cn('hover:bg-raised', p.id === selected && 'bg-raised')}>
                    <td className="px-4 py-3"><ProbeName id={p.id} name={p.name} /></td>
                    <td className="px-4 py-3"><ProbeStatus status={p.status} /></td>
                    <td className="mono px-4 py-3 text-ink-2">{formatCoord(p.sector)}</td>
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

function ProbeCard({ probe: p, listed, crew, selected, distance, onOpen }: { probe: Probe; listed: Probe; crew?: Manny[]; selected: boolean; distance?: number; onOpen: () => void }) {
  const reachable = isReachable(listed);
  const inv = p.inventory;
  const theme = useProbeTheme(p.id);
  const own = useThemes((s) => s.probes[p.id]);
  const setTheme = useThemes((s) => s.set);
  const clearTheme = useThemes((s) => s.clear);
  const [editing, setEditing] = useState(false);
  return (
    // Each card wears its probe's own colours, whichever probe is in command.
    <Card style={themeStyle(theme)} className={cn('flex flex-col bg-panel', selected && 'border-accent-line', !reachable && 'bg-chrome')}>
      <div className="flex items-start gap-3 p-5 pb-4">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[16px] font-semibold tracking-[-0.01em]">{p.name}</span>
            {listed.isDefault && <Crown className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Default probe" />}
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-3">
            <span className="mono">#{p.id} · {formatCoord(p.sector)}</span>
            {distance !== undefined && distance > 0 && ` · ${distance} hop${distance === 1 ? '' : 's'} away`}
          </div>
        </div>
        <ProbeStatus status={p.status} />
      </div>
      <div className="flex-1 px-5">
        {!reachable ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong p-3 text-[12.5px] text-ink-3">
            <WifiOff className="h-3.5 w-3.5 shrink-0" /> Outside SCUT coverage. Only its last position is known.
          </p>
        ) : p.movement && isMoving(p) ? (
          <MovementPanel movement={p.movement} status={p.status} />
        ) : (
          <div className="space-y-3.5">
            <Readout icon={<ShieldCheck />} label="Integrity" value={p.integrity} unit="%" />
            <Readout icon={<Droplets />} label="Deuterium" value={p.deuterium} unit="%" />
            {inv?.capacity ? <Readout icon={<Boxes />} label="Cargo" value={((inv.usedCapacity ?? 0) / inv.capacity) * 100} unit="%" invert /> : null}
          </div>
        )}
      </div>
      {editing && (
        <div className="mx-5 mt-4 rounded-lg border border-line bg-chrome p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium">Colours for {p.name}</span>
            {own && (
              <button className="text-[12px] text-ink-3 hover:text-ink" onClick={() => clearTheme(p.id)}>
                Use app default
              </button>
            )}
          </div>
          <ThemePicker value={theme} onChange={(t) => setTheme(p.id, t)} />
        </div>
      )}
      <div className="mt-4 flex items-center gap-2 border-t border-line px-5 py-3">
        {crew ? (
          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <Bot className="h-3.5 w-3.5" />
            <span className="num text-ink-2">{crew.filter(mannyReady).length}</span> of <span className="num">{crew.length}</span> ready
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-3">Crew unknown</span>
        )}
        <Button size="xs" variant="ghost" className="ml-auto" aria-expanded={editing} icon={<Palette className="h-3.5 w-3.5" />} onClick={() => setEditing(!editing)}>
          {editing ? 'Done' : 'Colours'}
        </Button>
        {selected ? (
          <span className="flex h-7 items-center rounded-md px-2.5 text-xs font-medium text-accent">In command</span>
        ) : (
          <Button size="xs" variant="secondary" disabled={!reachable} onClick={onOpen}>
            Take command <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  );
}

function ProbeName({ id, name }: { id: string; name: string }) {
  const theme = useProbeTheme(id);
  return (
    <div className="flex items-center gap-2.5" style={themeStyle(theme)}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
      <div>
        <div className="font-medium">{name}</div>
        <div className="mono text-[12px] text-ink-3">#{id}</div>
      </div>
    </div>
  );
}
