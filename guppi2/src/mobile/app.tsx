import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import * as D from '@radix-ui/react-dialog';
import { Activity, AlertOctagon, Bot, ChevronDown, Home, LogOut, MessagesSquare, Monitor, Radar, RefreshCw, Workflow, X } from 'lucide-react';
import { queryClient } from '@/state/query';
import { useSession } from '@/state/session';
import { applyTheme, useProbeTheme } from '@/state/theme';
import { useAlerts, useMessages, useProbes } from '@/state/hooks';
import { formatCoord } from '@/core/lattice';
import { isReachable } from '@/core/models';
import { Logo, ProbeStatus, statusTone } from '@/components/bits';
import { Button, StatusDot, TooltipProvider, cn } from '@/components/ui/primitives';
import { forgetConnection } from './connection';
import { MobileConnect } from './connect';
import { HomeScreen } from './home';
import { CrewScreen, SectorScreen } from './crew-sector';
import { CommsScreen, JobsScreen } from './jobs-comms';

type Tab = 'home' | 'crew' | 'sector' | 'jobs' | 'comms';
const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Bridge', icon: Home },
  { id: 'crew', label: 'Crew', icon: Bot },
  { id: 'sector', label: 'Sector', icon: Radar },
  { id: 'jobs', label: 'Jobs', icon: Workflow },
  { id: 'comms', label: 'Comms', icon: MessagesSquare },
];

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6 text-center">
        <AlertOctagon className="mx-auto h-7 w-7 text-bad" />
        <div className="mt-2 font-semibold">This screen hit a problem</div>
        <p className="mt-1 text-sm text-ink-3">{this.state.error.message}</p>
        <Button className="mt-4" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    );
  }
}

function Shell() {
  const [tab, setTab] = useState<Tab>('home');
  const [probeSheet, setProbeSheet] = useState(false);
  const probeId = useSession((s) => s.selectedProbeId)!;
  const mode = useSession((s) => s.mode);
  const game = useSession((s) => s.game)!;
  const probes = useProbes();
  const qc = useQueryClient();
  const current = probes.data?.find((p) => p.id === probeId);
  const stats = useSyncExternalStore(game.scheduler.subscribe, game.scheduler.stats);
  const alerts = useAlerts(probeId);
  const unread = useMessages(probeId, 0, true);
  const comms = (alerts.data?.filter((a) => a.status === 'unread').length ?? 0) + (unread.data?.total ?? 0);
  const linkTone = stats.link === 'offline' ? 'bad' : stats.link === 'busy' ? 'accent' : 'ok';
  const Screen = { home: HomeScreen, crew: CrewScreen, sector: SectorScreen, jobs: JobsScreen, comms: CommsScreen }[tab];

  return (
    <div className="bg-base flex h-[100dvh] flex-col">
      <header className="shrink-0 border-b border-line bg-chrome pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-2 px-4">
          <Logo size={26} />
          <button onClick={() => setProbeSheet(true)} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 active:bg-raised">
            <StatusDot tone={statusTone(current?.status)} pulse={current?.status === 'cruising'} />
            <div className="min-w-0 text-left leading-tight">
              <div className="truncate text-[15px] font-semibold">{current?.name ?? 'Probe'}</div>
              <div className="num truncate text-[12px] text-ink-3">
                {mode === 'remote' ? 'via your PC' : mode === 'simulator' ? 'simulator' : 'direct'} · {formatCoord(current?.sector)}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" />
          </button>
          <span className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-[12px] text-ink-3">
            <StatusDot tone={linkTone} pulse={stats.link === 'busy'} />
            {stats.link === 'offline' ? 'Offline' : stats.queued ? `${stats.queued}` : 'Live'}
          </span>
          <button aria-label="Refresh" className="grid h-10 w-10 place-items-center rounded-xl text-ink-2 active:bg-raised" onClick={() => void qc.invalidateQueries()}>
            <RefreshCw className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Boundary resetKey={tab + probeId}>
          <Screen key={probeId} />
        </Boundary>
      </main>

      <nav className="shrink-0 border-t border-line bg-chrome pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn('relative flex h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-medium', on ? 'text-accent' : 'text-ink-3')}>
                <t.icon className="h-5 w-5" />
                {t.label}
                {t.id === 'comms' && comms > 0 && (
                  <span className="num absolute right-[calc(50%-18px)] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[12px] font-bold text-accent-ink">{comms}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <ProbeSheet open={probeSheet} onOpenChange={setProbeSheet} />
    </div>
  );
}

function ProbeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const probes = useProbes();
  const selected = useSession((s) => s.selectedProbeId);
  const select = useSession((s) => s.selectProbe);
  const mode = useSession((s) => s.mode);
  const base = useSession((s) => s.base);
  const disconnect = useSession((s) => s.disconnect);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 animate-fade-in bg-void/80" />
        <D.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] animate-rise overflow-y-auto rounded-t-2xl border-t border-line-strong bg-panel pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-pop">
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15" />
          <div className="flex items-center px-5 pb-2 pt-3">
            <D.Title className="flex-1 text-[16px] font-semibold">Your fleet</D.Title>
            <D.Close className="rounded-lg p-2 text-ink-3" aria-label="Close">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          <D.Description className="sr-only">Choose a probe</D.Description>
          <div className="space-y-1 px-3">
            {probes.data?.map((p) => (
              <button
                key={p.id}
                disabled={!isReachable(p)}
                onClick={() => {
                  select(p.id);
                  onOpenChange(false);
                }}
                className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left disabled:opacity-45', p.id === selected ? 'bg-raised' : 'active:bg-raised')}
              >
                <StatusDot tone={statusTone(p.status)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="num text-xs text-ink-3">
                    #{p.id} · {formatCoord(p.sector)}
                  </div>
                </div>
                <ProbeStatus status={p.status} />
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-line px-5 pt-4">
            <div className="flex items-center gap-2 text-xs text-ink-3">
              {mode === 'remote' ? <Monitor className="h-4 w-4 text-accent" /> : <Activity className="h-4 w-4 text-accent" />}
              <span className="flex-1 truncate">
                {mode === 'remote' ? `Remote: GUPPI on your PC (${base?.replace(/^https?:\/\//, '')})` : mode === 'simulator' ? 'Simulator — nothing is sent to the game' : 'Direct to the game from this phone'}
              </span>
            </div>
            <Button
              variant="danger"
              className="mt-3 w-full"
              icon={<LogOut className="h-4 w-4" />}
              onClick={() => {
                forgetConnection();
                onOpenChange(false);
                void disconnect();
              }}
            >
              Disconnect this phone
            </Button>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export default function MobileApp() {
  const status = useSession((s) => s.status);
  const hasProbe = useSession((s) => !!s.selectedProbeId);
  const theme = JSON.stringify(useProbeTheme(useSession((s) => s.selectedProbeId)));
  useEffect(() => {
    applyTheme(JSON.parse(theme));
  }, [theme]);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {status === 'connected' && hasProbe ? <Shell /> : <MobileConnect />}
        <Toaster
          theme="dark"
          position="top-center"
          offset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
          toastOptions={{ classNames: { toast: '!bg-panel !border-line-strong !text-ink !rounded-xl !shadow-pop !font-sans', description: '!text-ink-3', actionButton: '!bg-accent !text-accent-ink !font-semibold' } }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
