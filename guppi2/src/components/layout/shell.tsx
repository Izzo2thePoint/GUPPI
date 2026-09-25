import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { Check, ChevronsUpDown, Command, FlaskConical, LogOut, Monitor, Plug, Search, Workflow, WifiOff } from 'lucide-react';
import { useSession } from '@/state/session';
import { useNav } from '@/state/nav';
import { useJobs, activeJobs } from '@/state/jobs';
import { useProbes, useAlerts, useMessages, useNow } from '@/state/hooks';
import { formatCoord } from '@/core/lattice';
import { isReachable } from '@/core/models';
import { NAV, ALL_NAV } from './nav-items';
import { Logo, ProbeStatus, statusTone } from '../bits';
import { Badge, Button, Kbd, StatusDot, Tip, cn } from '../ui/primitives';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full bg-void">
      <Sidebar />
      <div className="bg-starfield relative flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function Sidebar() {
  const view = useNav((s) => s.view);
  const go = useNav((s) => s.go);
  const mode = useSession((s) => s.mode);
  const disconnect = useSession((s) => s.disconnect);
  const probeId = useSession((s) => s.selectedProbeId)!;
  const alerts = useAlerts(probeId);
  const unread = useMessages(probeId, 0, true);
  const commsCount = (alerts.data?.filter((a) => a.status === 'unread').length ?? 0) + (unread.data?.total ?? 0);

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-base/80">
      <div className="app-drag app-sidebar-head flex h-14 items-center gap-2.5 px-4">
        <Logo size={28} />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">GUPPI</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-3">Mission Control</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">{g.group}</div>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = view === item.view;
                const Icon = item.icon;
                return (
                  <button
                    key={item.view}
                    onClick={() => go(item.view)}
                    className={cn(
                      'group relative flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors',
                      active ? 'bg-raised text-ink shadow-[0_0_0_1px_var(--color-line-strong)]' : 'text-ink-3 hover:bg-white/[0.03] hover:text-ink-2',
                    )}
                  >
                    {active && <span className="absolute -left-3 top-2 h-5 w-[3px] rounded-r-full bg-[linear-gradient(var(--accent),var(--accent-2))]" />}
                    <Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-ink-4 group-hover:text-ink-3')} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.view === 'comms' && commsCount > 0 && (
                      <span className="num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-[#050810]">{commsCount}</span>
                    )}
                    {item.key && !(item.view === 'comms' && commsCount > 0) && <span className="text-[10px] text-ink-4 opacity-0 group-hover:opacity-100">⌃{item.key}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2 rounded-[10px] border border-line bg-white/[0.02] px-2.5 py-2">
          {mode === 'simulator' ? <FlaskConical className="h-4 w-4 text-accent-2" /> : mode === 'desktop' ? <Monitor className="h-4 w-4 text-accent" /> : <Plug className="h-4 w-4 text-accent" />}
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-xs font-medium">{mode === 'simulator' ? 'Simulator' : 'Live game'}</div>
            <div className="truncate text-[10px] text-ink-3">{mode === 'simulator' ? 'Nothing is sent to the game' : 'neumann-probe.net'}</div>
          </div>
          <Tip content="Disconnect">
            <button className="rounded-md p-1.5 text-ink-3 hover:bg-raised hover:text-ink" onClick={() => void disconnect()} aria-label="Disconnect">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </Tip>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const view = useNav((s) => s.view);
  const setPalette = useNav((s) => s.setPalette);
  const setJobs = useNav((s) => s.setJobs);
  const jobs = useJobs((s) => s.jobs);
  const running = activeJobs(jobs);
  const item = ALL_NAV.find((i) => i.view === view)!;

  return (
    <header className="app-drag app-titlebar flex h-14 shrink-0 items-center gap-3 border-b border-line bg-base/60 px-5 backdrop-blur-xl">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold tracking-tight">{item.label}</div>
      </div>
      <div className="mx-2 h-5 w-px bg-line-strong" />
      <ProbeSwitcher />
      <div className="flex-1" />
      <LinkStatus />
      <Button variant="outline" size="sm" onClick={() => setJobs(true)} className="gap-2">
        <Workflow className={cn('h-4 w-4', running.length && 'text-accent')} />
        Jobs
        {running.length > 0 && <span className="num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-[#050810]">{running.length}</span>}
      </Button>
      <button
        onClick={() => setPalette(true)}
        className="flex h-8 w-60 items-center gap-2 whitespace-nowrap rounded-[10px] border border-line-strong bg-void/50 px-2.5 text-[13px] text-ink-3 transition-colors hover:border-[rgb(148_163_184/0.24)] hover:text-ink-2"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 truncate text-left">Search or run a command…</span>
        <Kbd>
          <Command className="h-2.5 w-2.5" />K
        </Kbd>
      </button>
    </header>
  );
}

function ProbeSwitcher() {
  const probes = useProbes();
  const selected = useSession((s) => s.selectedProbeId);
  const select = useSession((s) => s.selectProbe);
  const current = probes.data?.find((p) => p.id === selected);
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="flex h-9 items-center gap-2.5 rounded-[10px] px-2 transition-colors hover:bg-raised">
          <StatusDot tone={statusTone(current?.status)} pulse={current?.status === 'cruising'} />
          <div className="text-left leading-tight">
            <div className="text-[13px] font-semibold">{current?.name ?? 'Probe'}</div>
            <div className="num text-[10px] text-ink-3">#{selected} · {formatCoord(current?.sector)}</div>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 text-ink-3" />
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="start" sideOffset={6} className="z-50 w-72 animate-fade-in rounded-xl border border-line-strong bg-panel p-1.5 shadow-pop">
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">Your fleet</div>
          {probes.data?.map((p) => (
            <DM.Item
              key={p.id}
              onSelect={() => select(p.id)}
              disabled={!isReachable(p)}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-raised data-[disabled]:opacity-50"
            >
              <StatusDot tone={statusTone(p.status)} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="num text-[11px] text-ink-3">
                  #{p.id} · {formatCoord(p.sector)}
                </div>
              </div>
              {p.id === selected ? <Check className="h-4 w-4 text-accent" /> : <ProbeStatus status={p.status} />}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function LinkStatus() {
  const game = useSession((s) => s.game)!;
  const stats = useSyncExternalStore(game.scheduler.subscribe, game.scheduler.stats);
  const now = useNow(1000);
  const wait = stats.waitUntil > now ? Math.ceil((stats.waitUntil - now) / 1000) : 0;
  const tone = stats.link === 'offline' ? 'bad' : wait > 5 ? 'warn' : stats.link === 'busy' ? 'accent' : 'ok';
  const text =
    stats.link === 'offline' ? 'Offline' : wait > 5 ? `Rate limit · ${wait}s` : stats.link === 'busy' ? 'Syncing' : stats.queued ? `${stats.queued} queued` : 'Linked';
  return (
    <Tip
      content={
        <div className="space-y-1">
          <div>Requests sent: {stats.sent}</div>
          {stats.remaining !== null && (
            <div>
              Rate budget: {stats.remaining}
              {stats.limit ? ` / ${stats.limit}` : ''} remaining
            </div>
          )}
          {stats.lastLatencyMs !== null && <div>Last latency: {stats.lastLatencyMs} ms</div>}
          <div>Queued: {stats.queued}</div>
        </div>
      }
    >
      <button onClick={() => (stats.link === 'offline' ? game.scheduler.nudge() : useNav.getState().go('activity'))}>
        <Badge tone={tone} className="h-8 gap-2 rounded-[10px] px-3 text-xs">
          {stats.link === 'offline' ? <WifiOff className="h-3.5 w-3.5" /> : <StatusDot tone={tone} pulse={stats.link === 'busy'} />}
          <span className="num">{text}</span>
          {stats.remaining !== null && stats.link !== 'offline' && <span className="num text-ink-3">{stats.remaining}</span>}
        </Badge>
      </button>
    </Tip>
  );
}

/** Global keyboard shortcuts. */
export function useShortcuts() {
  const go = useNav((s) => s.go);
  const setPalette = useNav((s) => s.setPalette);
  const setJobs = useNav((s) => s.setJobs);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!useNav.getState().palette);
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setJobs(!useNav.getState().jobs);
      } else if (mod && /^[1-9]$/.test(e.key)) {
        const item = ALL_NAV.find((i) => i.key === e.key);
        if (item) {
          e.preventDefault();
          go(item.view);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const off = window.guppi?.onMenu((a) => {
      if (a === 'palette') setPalette(true);
      else if (a === 'jobs') setJobs(true);
      else if (a.startsWith('view:')) go(a.slice(5) as never);
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      off?.();
    };
  }, [go, setPalette, setJobs]);
}
