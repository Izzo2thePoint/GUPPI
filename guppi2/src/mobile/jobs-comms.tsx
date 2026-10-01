import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, CheckCheck, Factory, Hourglass, Mail, MailOpen, Monitor, Pause, Play, Square } from 'lucide-react';
import { useGame, useSession } from '@/state/session';
import { keys, useAction, useAlerts, useMessages, useNow, useSelectedProbeId } from '@/state/hooks';
import { useJobs } from '@/state/jobs';
import { label } from '@/core/models';
import { errorMessage } from '@/core/errors';
import { fmtDuration, fmtNumber, fmtRelative } from '@/core/format';
import { formatCoord } from '@/core/lattice';
import type { RemoteJob, RemoteOutpost } from '@/state/remote-host';
import { Badge, Button, Empty, ErrorNote, Segmented, Skeleton, cn, type Tone } from '@/components/ui/primitives';
import { Meter } from '@/components/ui/data';
import { remoteAction, useRemoteStatus, useRunner } from './connection';

const JOB_TONE: Record<string, Tone> = { running: 'accent', waiting: 'warn', queued: 'neutral', done: 'ok', failed: 'bad', stopped: 'neutral' };
const OUTPOST_TONE: Record<string, Tone> = { running: 'ok', waiting: 'info', ready: 'accent', paused: 'neutral', complete: 'ok', blocked: 'bad', setup: 'neutral' };

export function JobsScreen() {
  const mode = useSession((s) => s.mode);
  return mode === 'remote' ? <PcJobs /> : <LocalJobs />;
}

function PcJobs() {
  const status = useRemoteStatus(true);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(done);
      await qc.invalidateQueries({ queryKey: ['pc-status'] });
    } catch (e) {
      toast.error('The PC refused', { description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };
  if (status.isLoading) return <div className="space-y-2 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
  if (status.error) return <div className="p-4"><ErrorNote error={status.error} onRetry={() => status.refetch()} /></div>;
  const s = status.data!;
  const running = s.jobs.filter((j) => !j.finishedAt && !j.kind.startsWith('outpost:')).reverse();
  const finished = s.jobs.filter((j) => j.finishedAt).reverse().slice(0, 8);
  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-2 px-1 text-xs text-ink-3">
        <Monitor className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate">GUPPI {s.version} on your PC · {s.connected ? 'online' : 'not connected to the game'}</span>
        {s.link && <span className="num ml-auto shrink-0">{s.link.queued} queued</span>}
      </div>

      <section>
        <h2 className="mb-2 px-1 text-[13px] font-semibold text-ink-2">Outposts</h2>
        <div className="space-y-2">
          {s.outposts.map((o) => (
            <OutpostCard
              key={o.id}
              o={o}
              busy={busy === o.id}
              onPause={() => act(o.id, () => remoteAction({ type: 'pause-outpost', id: o.id }), `${o.name} paused`)}
              onResume={() => act(o.id, () => remoteAction({ type: 'resume-outpost', id: o.id }), `${o.name} resumed`)}
            />
          ))}
          {!s.outposts.length && <div className="surface rounded-2xl p-4 text-sm text-ink-3">No outposts yet. Set them up in GUPPI on your PC (Outposts screen).</div>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-[13px] font-semibold text-ink-2">Running on your PC</h2>
        <div className="space-y-2">
          {running.map((j) => (
            <JobCard key={j.id} job={j} busy={busy === j.id} onStop={() => act(j.id, () => remoteAction({ type: 'stop-job', id: j.id }), 'Stopped')} />
          ))}
          {!running.length && <Empty icon={<Hourglass />} title="Nothing running">Start mining or a scan from the Bridge tab.</Empty>}
        </div>
      </section>

      {finished.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-semibold text-ink-2">Recently finished</h2>
          <div className="space-y-2">
            {finished.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OutpostCard({ o, busy, onPause, onResume }: { o: RemoteOutpost; busy: boolean; onPause: () => void; onResume: () => void }) {
  const pct = o.total ? Math.min(100, (o.mined / o.total) * 100) : 0;
  return (
    <div className="surface rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Factory className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{o.name}</span>
            <Badge tone={OUTPOST_TONE[o.status] ?? 'neutral'} dot className="ml-auto shrink-0">
              {o.running && o.status !== 'waiting' ? 'Running' : label(o.status)}
            </Badge>
          </div>
          <div className="text-xs text-ink-3">
            {o.targetName} · {label(o.resource)} · <span className="num">{formatCoord(o.coord)}</span>
          </div>
        </div>
      </div>
      <p className={cn('mt-2 text-xs leading-relaxed', o.status === 'blocked' ? 'text-bad' : 'text-ink-2')}>{o.message}</p>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
        <span>
          {o.loads} load{o.loads === 1 ? '' : 's'} · {fmtNumber(o.mined, 3)} / {fmtNumber(o.total, 3)} ECE
        </span>
        <span className="num">{Math.round(pct)}%</span>
      </div>
      <Meter value={pct} className="mt-1.5" />
      <div className="mt-3 flex gap-2">
        {o.running ? (
          <Button className="flex-1" icon={<Pause className="h-4 w-4" />} loading={busy} onClick={onPause}>
            Pause
          </Button>
        ) : (
          o.status !== 'complete' && (
            <Button className="flex-1" variant="primary" icon={<Play className="h-4 w-4" />} loading={busy} onClick={onResume}>
              Resume
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function JobCard({ job: j, busy, onStop }: { job: RemoteJob; busy?: boolean; onStop?: () => void }) {
  const now = useNow(1000);
  return (
    <div className="surface rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{j.name}</span>
        <Badge tone={JOB_TONE[j.state] ?? 'neutral'}>{label(j.state)}</Badge>
      </div>
      <p className={cn('mt-1 text-xs leading-relaxed', j.state === 'failed' ? 'text-bad' : 'text-ink-3')}>{j.message}</p>
      {j.progress !== undefined && !j.finishedAt && <Meter value={j.progress * 100} className="mt-2" thin />}
      <div className="mt-2 flex items-center justify-between">
        <span className="num text-[12px] text-ink-4">{fmtDuration(((j.finishedAt ?? now) - j.startedAt) / 1000)}</span>
        {onStop && (
          <Button size="sm" variant="ghost" icon={<Square className="h-3.5 w-3.5" />} loading={busy} onClick={onStop}>
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}

function LocalJobs() {
  const jobs = useJobs((s) => s.jobs);
  const runner = useRunner();
  const list = jobs.slice().reverse();
  return (
    <div className="space-y-2 p-4">
      <div className="rounded-2xl border border-warn/20 bg-warn/[0.05] px-4 py-3 text-xs leading-relaxed text-warn/90">
        These jobs run on this phone and pause when it sleeps or you leave the app. For automations that keep going, connect GUPPI Mobile to GUPPI on your PC.
      </div>
      {list.map((j) => (
        <JobCard key={j.id} job={j} onStop={j.finishedAt ? undefined : () => void runner.stopJob(j.id)} />
      ))}
      {!list.length && <Empty icon={<Hourglass />} title="No jobs yet">Start mining or a scan from the Bridge tab.</Empty>}
    </div>
  );
}

// ── Comms ────────────────────────────────────────────────────────────────────

export function CommsScreen() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const [tab, setTab] = useState<'alerts' | 'messages'>('alerts');
  const alerts = useAlerts(probeId);
  const messages = useMessages(probeId, 0, false);
  const readAlert = useAction((id: string) => game.markAlertRead(probeId, id), { label: 'Marking read…', success: 'Marked as read', invalidate: [keys.alerts(probeId)] });
  const readMessage = useAction((id: string) => game.markMessageRead(probeId, id), { label: 'Marking read…', success: 'Marked as read', invalidate: [['messages', probeId]] });
  const unreadAlerts = alerts.data?.filter((a) => a.status === 'unread') ?? [];

  return (
    <div className="p-4">
      <Segmented
        className="mb-3 w-full [&>button]:h-9 [&>button]:flex-1"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'alerts', label: `Alerts${unreadAlerts.length ? ` · ${unreadAlerts.length}` : ''}` },
          { value: 'messages', label: `Messages${messages.data?.messages.some((m) => m.status === 'unread') ? ' •' : ''}` },
        ]}
      />
      {tab === 'alerts' ? (
        <div className="space-y-2">
          {alerts.error && <ErrorNote error={alerts.error} onRetry={() => alerts.refetch()} />}
          {unreadAlerts.length > 1 && (
            <Button size="sm" variant="ghost" icon={<CheckCheck className="h-4 w-4" />} onClick={() => unreadAlerts.forEach((a) => readAlert.mutate(a.id))}>
              Mark all read
            </Button>
          )}
          {alerts.data?.map((a) => (
            <button key={a.id} onClick={() => a.status === 'unread' && readAlert.mutate(a.id)} className="surface flex w-full gap-3 rounded-2xl p-4 text-left">
              <Bell className={cn('mt-0.5 h-4 w-4 shrink-0', a.status === 'unread' ? (a.severity === 'warning' ? 'text-warn' : 'text-accent') : 'text-ink-4')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn('truncate', a.status === 'unread' ? 'font-semibold' : 'text-ink-2')}>{a.title}</span>
                  <span className="ml-auto shrink-0 text-[12px] text-ink-4">{fmtRelative(a.createdAt)}</span>
                </span>
                {a.message && <span className="mt-0.5 block text-sm leading-relaxed text-ink-3">{a.message}</span>}
              </span>
            </button>
          ))}
          {alerts.data && !alerts.data.length && <Empty icon={<Bell />} title="All quiet" />}
        </div>
      ) : (
        <div className="space-y-2">
          {messages.error && <ErrorNote error={messages.error} onRetry={() => messages.refetch()} />}
          {messages.data?.messages.map((m) => (
            <button key={m.id} onClick={() => m.status === 'unread' && readMessage.mutate(m.id)} className="surface flex w-full gap-3 rounded-2xl p-4 text-left">
              {m.status === 'unread' ? <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : <MailOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn('truncate', m.status === 'unread' ? 'font-semibold' : 'text-ink-2')}>{m.sender ?? 'Unknown sender'}</span>
                  <span className="ml-auto shrink-0 text-[12px] text-ink-4">{fmtRelative(m.sentAt)}</span>
                </span>
                <span className="mt-0.5 block whitespace-pre-wrap text-sm leading-relaxed text-ink-3">{m.body}</span>
              </span>
            </button>
          ))}
          {messages.data && !messages.data.messages.length && <Empty icon={<Mail />} title="Inbox empty" />}
        </div>
      )}
    </div>
  );
}
