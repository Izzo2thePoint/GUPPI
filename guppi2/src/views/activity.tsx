import { useMemo, useState, useSyncExternalStore } from 'react';
import { Activity as ActivityIcon, Gauge, ListOrdered, Timer, Zap } from 'lucide-react';
import { useSession } from '@/state/session';
import { useNow } from '@/state/hooks';
import { fmtNumber } from '@/core/format';
import { Badge, Button, Card, CardHeader, Empty, Segmented, cn } from '@/components/ui/primitives';
import { Sparkline, Stat } from '@/components/ui/data';
import { Page, PageHeader } from '@/components/shared';

type Filter = 'all' | 'errors' | 'mutations';

export default function Activity() {
  const game = useSession((s) => s.game)!;
  const activity = useSession((s) => s.activity);
  const stats = useSyncExternalStore(game.scheduler.subscribe, game.scheduler.stats);
  const now = useNow(1000);
  const [filter, setFilter] = useState<Filter>('all');

  const rows = activity.filter((a) => (filter === 'errors' ? a.outcome === 'error' || a.outcome === 'retry' : filter === 'mutations' ? a.method !== 'GET' : true));
  const latencies = useMemo(() => activity.filter((a) => a.durationMs !== null).slice(0, 40).reverse().map((a) => a.durationMs!), [activity]);
  const perMinute = useMemo(() => {
    const buckets = Array.from({ length: 15 }, () => 0);
    for (const a of activity) {
      const m = Math.max(0, Math.floor((now - a.at) / 60_000));
      if (m < 15) buckets[14 - m]++;
    }
    return buckets;
  }, [activity, now]);
  const wait = stats.waitUntil > now ? Math.ceil((stats.waitUntil - now) / 1000) : 0;

  return (
    <Page>
      <PageHeader
        title="Activity"
        subtitle="Every request GUPPI sends, in order. User actions jump the queue ahead of automation and background refreshes."
        actions={<Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'mutations', label: 'Orders' }, { value: 'errors', label: 'Errors & retries' }]} />}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Link" icon={<Zap />} value={stats.link === 'offline' ? 'Offline' : wait ? `Waiting ${wait}s` : stats.link === 'busy' ? 'Busy' : 'Ready'} tone={stats.link === 'offline' ? 'bad' : wait ? 'warn' : 'ok'} sub={`${stats.queued} queued · ${stats.sent} sent`} />
        <Stat label="Rate budget" icon={<Gauge />} value={stats.remaining ?? '—'} sub={stats.limit ? `of ${stats.limit} per window` : 'Reported by the game'} />
        <Card className="px-4 py-3 !animate-none">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><Timer className="h-3.5 w-3.5" /> Latency</div>
          <div className="num mt-1.5 text-xl font-semibold">{stats.lastLatencyMs ?? '—'}<span className="text-sm text-ink-3"> ms</span></div>
          <Sparkline values={latencies} className="mt-1" height={24} />
        </Card>
        <Card className="px-4 py-3 !animate-none">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><ListOrdered className="h-3.5 w-3.5" /> Requests / min</div>
          <div className="num mt-1.5 text-xl font-semibold">{perMinute[14]}</div>
          <Sparkline values={perMinute} className="mt-1" height={24} />
        </Card>
      </div>
      {stats.link === 'offline' && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-bad/25 bg-bad/[0.06] px-4 py-3 text-sm text-bad">
          The game is unreachable. Background refreshes are paused and retried every 15 seconds; your actions are still attempted.
          <Button size="xs" variant="danger" className="ml-auto" onClick={() => game.scheduler.nudge()}>Retry now</Button>
        </div>
      )}
      <Card className="mt-5">
        <CardHeader title="Request log" subtitle={`Last ${activity.length} requests this session`} icon={<ActivityIcon />} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[12px] font-medium text-ink-3">
                <th className="px-5 py-2 font-medium">Time</th>
                <th className="px-2 py-2 font-medium">Priority</th>
                <th className="px-2 py-2 font-medium">Request</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-5 py-2 text-right font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.slice(0, 200).map((a) => (
                <tr key={`${a.id}-${a.outcome}`} className="hover:bg-raised">
                  <td className="num whitespace-nowrap px-5 py-2 text-xs text-ink-3">{new Date(a.at).toLocaleTimeString()}</td>
                  <td className="px-2 py-2"><Badge tone={a.priority === 'user' ? 'accent' : a.priority === 'automation' ? 'info' : 'neutral'}>{a.priority}</Badge></td>
                  <td className="max-w-[520px] px-2 py-2">
                    <div className="truncate text-ink-2">{a.label}</div>
                    <div className="num truncate text-[12px] text-ink-4">{a.method} {a.path}</div>
                    {a.note && <div className={cn('truncate text-[12px]', a.outcome === 'error' ? 'text-bad' : 'text-warn')}>{a.note}</div>}
                  </td>
                  <td className="px-2 py-2">
                    <Badge tone={a.outcome === 'ok' ? 'ok' : a.outcome === 'retry' ? 'warn' : a.outcome === 'error' ? 'bad' : 'neutral'}>{a.status ?? a.outcome}</Badge>
                  </td>
                  <td className="num px-5 py-2 text-right text-xs text-ink-3">{a.durationMs !== null ? `${fmtNumber(a.durationMs, 0)} ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty icon={<ActivityIcon />} title="No requests yet" />}
        </div>
      </Card>
    </Page>
  );
}
