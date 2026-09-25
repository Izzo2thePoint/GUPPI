import { useState } from 'react';
import * as D from '@radix-ui/react-dialog';
import { CheckCircle2, ChevronDown, CircleSlash, Hourglass, Loader2, OctagonX, Trash2, X, XCircle } from 'lucide-react';
import { useNav } from '@/state/nav';
import { useJobs, activeJobs } from '@/state/jobs';
import type { Job } from '@/core/claims';
import { fmtDuration } from '@/core/format';
import { useNow } from '@/state/hooks';
import { Button, Empty, cn } from '../ui/primitives';
import { Meter } from '../ui/data';

export function JobsDrawer() {
  const open = useNav((s) => s.jobs);
  const setOpen = useNav((s) => s.setJobs);
  const jobs = useJobs((s) => s.jobs);
  const { stopAll, clearFinished } = useJobs.getState();
  const running = activeJobs(jobs);
  const finished = jobs.filter((j) => j.finishedAt).reverse();

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 animate-fade-in bg-[#02040a]/40" />
        <D.Content className="fixed bottom-0 right-0 top-0 z-50 flex w-[420px] max-w-full flex-col border-l border-line-strong bg-panel shadow-pop data-[state=open]:animate-[rise_.25s_ease-out]">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <div className="flex-1">
              <D.Title className="text-[15px] font-semibold">Jobs</D.Title>
              <D.Description className="text-xs text-ink-3">
                {running.length ? `${running.length} running` : 'Nothing running'} · stopping never cancels orders the game already accepted
              </D.Description>
            </div>
            <D.Close className="rounded-lg p-1.5 text-ink-3 hover:bg-raised hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          <div className="flex gap-2 border-b border-line px-5 py-2.5">
            <Button size="xs" variant="danger" icon={<OctagonX className="h-3.5 w-3.5" />} disabled={!running.length} onClick={stopAll}>
              Stop all
            </Button>
            <Button size="xs" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} disabled={!finished.length} onClick={clearFinished}>
              Clear finished
            </Button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {!jobs.length && (
              <Empty icon={<Hourglass />} title="No jobs yet">
                Start a crafting queue, voyage, mining run or routine from Automation — or from the Workshop and Navigation screens.
              </Empty>
            )}
            {running.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
            {finished.length > 0 && <div className="px-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">Finished</div>}
            {finished.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function JobCard({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const now = useNow(1000);
  const Icon = { queued: Hourglass, waiting: Hourglass, running: Loader2, done: CheckCircle2, failed: XCircle, stopped: CircleSlash }[job.state];
  const tone = { queued: 'text-ink-3', waiting: 'text-warn', running: 'text-accent', done: 'text-ok', failed: 'text-bad', stopped: 'text-ink-3' }[job.state];
  return (
    <div className="rounded-xl border border-line bg-white/[0.02]">
      <div className="flex items-start gap-3 p-3">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone, job.state === 'running' && 'animate-spin [animation-duration:2s]')} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium">{job.name}</div>
            <span className="num ml-auto shrink-0 text-[11px] text-ink-4">{fmtDuration(((job.finishedAt ?? now) - job.startedAt) / 1000)}</span>
          </div>
          <div className={cn('mt-0.5 text-xs leading-relaxed', job.state === 'failed' ? 'text-bad' : 'text-ink-3')}>{job.message}</div>
          {job.progress !== undefined && !job.finishedAt && <Meter value={job.progress * 100} className="mt-2" thin />}
        </div>
        {!job.finishedAt && (
          <Button size="xs" variant="ghost" onClick={() => job.controller.abort()}>
            Stop
          </Button>
        )}
      </div>
      {job.log.length > 0 && (
        <>
          <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-1 border-t border-line px-3 py-1.5 text-[11px] text-ink-3 hover:text-ink-2">
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} /> Log ({job.log.length})
          </button>
          {open && (
            <div className="max-h-48 space-y-1 overflow-y-auto border-t border-line px-3 py-2 font-mono text-[11px]">
              {job.log.map((l, i) => (
                <div key={i} className={cn('flex gap-2', l.tone === 'error' ? 'text-bad' : l.tone === 'warn' ? 'text-warn' : l.tone === 'ok' ? 'text-ok' : 'text-ink-3')}>
                  <span className="shrink-0 text-ink-4">{new Date(l.at).toLocaleTimeString()}</span>
                  <span>{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
