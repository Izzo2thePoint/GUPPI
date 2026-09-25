import { Component, Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { AlertOctagon } from 'lucide-react';
import { queryClient } from './state/query';
import { useSession } from './state/session';
import { useSettings } from './state/settings';
import { useNav } from './state/nav';
import { useJobs } from './state/jobs';
import { useAlerts, useSelectedProbeId } from './state/hooks';
import { Shell, useShortcuts } from './components/layout/shell';
import { Palette } from './components/layout/palette';
import { JobsDrawer } from './components/layout/jobs-drawer';
import { Button, Skeleton, TooltipProvider } from './components/ui/primitives';
import { Connect } from './views/connect';

const views = {
  bridge: lazy(() => import('./views/bridge')),
  fleet: lazy(() => import('./views/fleet')),
  navigation: lazy(() => import('./views/navigation')),
  crew: lazy(() => import('./views/crew')),
  inventory: lazy(() => import('./views/inventory')),
  workshop: lazy(() => import('./views/workshop')),
  automation: lazy(() => import('./views/automation')),
  comms: lazy(() => import('./views/comms')),
  logbook: lazy(() => import('./views/logbook')),
  console: lazy(() => import('./views/console')),
  activity: lazy(() => import('./views/activity')),
  settings: lazy(() => import('./views/settings')),
};

/** A crash in one view never takes down the cockpit or running automation. */
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
      <div className="grid h-full place-items-center p-10">
        <div className="glass max-w-md rounded-card p-6 text-center">
          <AlertOctagon className="mx-auto h-8 w-8 text-bad" />
          <div className="mt-3 font-semibold">This screen hit a problem</div>
          <p className="mt-1 text-sm text-ink-3">Automation keeps running in the background. {this.state.error.message}</p>
          <Button className="mt-4" onClick={() => this.setState({ error: null })}>
            Reload screen
          </Button>
        </div>
      </div>
    );
  }
}

function ViewFallback() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-28" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

function Notifications() {
  const probeId = useSelectedProbeId();
  const alerts = useAlerts(probeId);
  const desktop = useSettings((s) => s.desktopNotifications);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!alerts.data) return;
    const unread = alerts.data.filter((a) => a.status === 'unread');
    if (seen.current) {
      for (const a of unread)
        if (!seen.current.has(a.id)) {
          toast(a.title, { description: a.message, action: { label: 'Open', onClick: () => useNav.getState().go('comms') } });
          if (desktop) void window.guppi?.notify(a.title, a.message ?? '');
        }
    }
    seen.current = new Set(alerts.data.map((a) => a.id));
  }, [alerts.data, desktop]);

  // Surface job completions wherever the user is.
  const version = useJobs((s) => s.version);
  const reported = useRef(new Set<string>());
  useEffect(() => {
    for (const j of useJobs.getState().jobs) {
      if (!j.finishedAt || reported.current.has(j.id)) continue;
      reported.current.add(j.id);
      if (j.state === 'done') toast.success(j.name, { description: j.message });
      else if (j.state === 'failed') {
        toast.error(`${j.name} failed`, { description: j.message, duration: 10_000 });
        if (desktop) void window.guppi?.notify(`${j.name} failed`, j.message);
      }
    }
  }, [version, desktop]);
  return null;
}

function Cockpit() {
  const view = useNav((s) => s.view);
  const probeId = useSelectedProbeId();
  useShortcuts();
  const View = views[view];
  return (
    <Shell>
      <Boundary resetKey={view + probeId}>
        <Suspense fallback={<ViewFallback />}>
          <View key={probeId} />
        </Suspense>
      </Boundary>
      <Palette />
      <JobsDrawer />
      <Notifications />
    </Shell>
  );
}

export default function App() {
  const status = useSession((s) => s.status);
  const hasProbe = useSession((s) => !!s.selectedProbeId);
  const accent = useSettings((s) => s.accent);
  const reduce = useSettings((s) => s.reduceMotion);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    document.documentElement.classList.toggle('reduce-motion', reduce);
  }, [accent, reduce]);

  useEffect(() => {
    if (window.guppi) document.documentElement.dataset.platform = window.guppi.platform;
    void useSession.getState().resume();
    const warn = (e: BeforeUnloadEvent) => {
      if (useJobs.getState().jobs.some((j) => !j.finishedAt)) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {status === 'connected' && hasProbe ? <Cockpit /> : <Connect />}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: '!bg-panel !border-line-strong !text-ink !rounded-xl !shadow-pop',
              description: '!text-ink-3',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
