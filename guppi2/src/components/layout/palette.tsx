import { Command } from 'cmdk';
import * as D from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut, OctagonX, Radar, RefreshCw, Terminal, Workflow } from 'lucide-react';
import { useNav } from '@/state/nav';
import { useSession } from '@/state/session';
import { useJobs } from '@/state/jobs';
import { useProbes } from '@/state/hooks';
import { catalog } from '@/core/catalog';
import { ALL_NAV } from './nav-items';
import { StatusDot } from '../ui/primitives';
import { statusTone } from '../bits';

const itemCls =
  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-2 data-[selected=true]:bg-raised data-[selected=true]:text-ink [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-ink-3';
const groupCls = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3';

export function Palette() {
  const open = useNav((s) => s.palette);
  const setOpen = useNav((s) => s.setPalette);
  const go = useNav((s) => s.go);
  const openConsole = useNav((s) => s.openConsole);
  const select = useSession((s) => s.selectProbe);
  const disconnect = useSession((s) => s.disconnect);
  const probes = useProbes();
  const qc = useQueryClient();
  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-void/80" />
        <D.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 animate-rise overflow-hidden rounded-xl border border-line-strong bg-panel shadow-pop">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search views, probes, actions and API endpoints</D.Description>
          <Command loop className="flex flex-col">
            <Command.Input autoFocus placeholder="Type a command, view, probe or endpoint…" className="h-13 border-b border-line bg-transparent px-4 text-[15px] text-ink outline-none placeholder:text-ink-4" />
            <Command.List className="max-h-[56vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-ink-3">No matches.</Command.Empty>
              <Command.Group heading="Go to" className={groupCls}>
                {ALL_NAV.map((i) => (
                  <Command.Item key={i.view} value={`go ${i.label} ${i.hint}`} onSelect={() => go(i.view)} className={itemCls}>
                    <i.icon />
                    <span className="flex-1">{i.label}</span>
                    <span className="text-xs text-ink-4">{i.hint}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Switch probe" className={groupCls}>
                {probes.data?.map((p) => (
                  <Command.Item key={p.id} value={`probe ${p.name} ${p.id}`} onSelect={() => run(() => select(p.id))} className={itemCls}>
                    <StatusDot tone={statusTone(p.status)} />
                    <span className="flex-1">{p.name}</span>
                    <span className="num text-xs text-ink-4">#{p.id}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Actions" className={groupCls}>
                <Command.Item
                  value="refresh all data reload"
                  className={itemCls}
                  onSelect={() =>
                    run(() => {
                      void qc.invalidateQueries();
                      toast.success('Refreshing all data');
                    })
                  }
                >
                  <RefreshCw /> Refresh everything
                </Command.Item>
                <Command.Item value="scan sensors" className={itemCls} onSelect={() => go('navigation')}>
                  <Radar /> Open sensors
                </Command.Item>
                <Command.Item value="jobs automation show" className={itemCls} onSelect={() => run(() => useNav.getState().setJobs(true))}>
                  <Workflow /> Show running jobs
                </Command.Item>
                <Command.Item
                  value="stop all jobs automation emergency"
                  className={itemCls}
                  onSelect={() =>
                    run(() => {
                      useJobs.getState().stopAll();
                      toast.warning('All automation stopped', { description: 'Orders already accepted by the game continue.' });
                    })
                  }
                >
                  <OctagonX /> Stop all automation
                </Command.Item>
                <Command.Item value="disconnect sign out logout" className={itemCls} onSelect={() => run(() => void disconnect())}>
                  <LogOut /> Disconnect
                </Command.Item>
              </Command.Group>
              <Command.Group heading="API endpoints" className={groupCls}>
                {catalog.map((op) => (
                  <Command.Item key={op.id} value={`api ${op.id} ${op.title}`} onSelect={() => openConsole(op.id)} className={itemCls}>
                    <Terminal />
                    <span className="num w-14 shrink-0 text-[12px] text-accent">{op.method}</span>
                    <span className="flex-1 truncate">{op.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
