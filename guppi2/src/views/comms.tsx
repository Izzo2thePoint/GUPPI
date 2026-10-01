import { useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, Inbox, Mail, MailOpen, PenSquare, Send, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useGame } from '@/state/session';
import { keys, useAction, useAlerts, useDamage, useMessages, useProbes, useSelectedProbeId, useSector } from '@/state/hooks';
import { flattenObjects } from '@/state/pickers';
import type { Alert } from '@/core/models';
import { fmtRelative, fmtTime } from '@/core/format';
import { Badge, Button, Card, CardHeader, Empty, ErrorNote, Field, Input, Segmented, Select, Skeleton, Textarea, cn } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { Page, PageHeader } from '@/components/shared';

type Tab = 'messages' | 'alerts' | 'damage';

export default function Comms() {
  const probeId = useSelectedProbeId();
  const [tab, setTab] = useState<Tab>('messages');
  const [compose, setCompose] = useState(false);
  const alerts = useAlerts(probeId);
  const damage = useDamage(probeId);
  const unread = useMessages(probeId, 0, true);
  const count = (l?: Alert[]) => l?.filter((a) => a.status === 'unread').length ?? 0;
  return (
    <Page>
      <PageHeader
        title="Comms"
        subtitle="Messages from probes and inhabited worlds, persistent alerts and damage reports."
        actions={
          <>
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'messages', label: <>Messages {unread.data?.total ? <Badge tone="accent" className="ml-1.5 h-4 px-1.5">{unread.data.total}</Badge> : null}</> },
                { value: 'alerts', label: <>Alerts {count(alerts.data) ? <Badge tone="accent" className="ml-1.5 h-4 px-1.5">{count(alerts.data)}</Badge> : null}</> },
                { value: 'damage', label: <>Damage {count(damage.data) ? <Badge tone="warn" className="ml-1.5 h-4 px-1.5">{count(damage.data)}</Badge> : null}</> },
              ]}
            />
            <Button variant="primary" size="sm" icon={<PenSquare className="h-3.5 w-3.5" />} onClick={() => setCompose(true)}>
              Compose
            </Button>
          </>
        }
      />
      {tab === 'messages' && <Messages probeId={probeId} />}
      {tab === 'alerts' && <AlertList probeId={probeId} kind="alerts" />}
      {tab === 'damage' && <AlertList probeId={probeId} kind="damage" />}
      {compose && <Compose probeId={probeId} onClose={() => setCompose(false)} />}
    </Page>
  );
}

function Messages({ probeId }: { probeId: string }) {
  const game = useGame();
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const q = useMessages(probeId, offset, unreadOnly);
  const read = useAction((id: string) => game.markMessageRead(probeId, id), { label: 'Marking read…', success: 'Marked as read' });
  const list = q.data?.messages ?? [];
  const current = list.find((m) => m.id === open) ?? list[0];
  const markRead = (id: string) =>
    read.mutate(id, { onSettled: () => void qc.invalidateQueries({ queryKey: ['messages', probeId] }) });

  return (
    <Card className="grid min-h-[560px] overflow-hidden lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col border-b border-line lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Segmented
            value={unreadOnly ? 'unread' : 'all'}
            onChange={(v) => (setUnreadOnly(v === 'unread'), setOffset(0))}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread' },
            ]}
          />
          <span className="ml-auto text-xs text-ink-3">{q.data?.total ?? 0} total</span>
        </div>
        <div className="flex-1 divide-y divide-line overflow-y-auto">
          {q.isLoading && <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
          {q.error && <div className="p-4"><ErrorNote error={q.error} onRetry={() => q.refetch()} /></div>}
          {list.map((m) => (
            <button key={m.id} onClick={() => setOpen(m.id)} className={cn('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-raised', current?.id === m.id && 'bg-raised')}>
              {m.status === 'unread' ? <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : <MailOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={cn('truncate text-sm', m.status === 'unread' ? 'font-semibold' : 'text-ink-2')}>{m.sender ?? 'Unknown sender'}</span>
                  <span className="ml-auto shrink-0 text-[12px] text-ink-4">{fmtRelative(m.sentAt)}</span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-ink-3">{m.body}</div>
              </div>
            </button>
          ))}
          {q.data && !list.length && <Empty icon={<Inbox />} title={unreadOnly ? 'Nothing unread' : 'Inbox empty'} />}
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-ink-3">
          <Button size="xs" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Newer</Button>
          <span className="num">{list.length ? `${offset + 1}–${offset + list.length}` : '0'}</span>
          <Button size="xs" variant="ghost" disabled={offset + list.length >= (q.data?.total ?? 0)} onClick={() => setOffset(offset + 25)}>Older</Button>
        </div>
      </div>
      <div className="flex flex-col">
        {current ? (
          <>
            <div className="flex items-center gap-3 border-b border-line px-6 py-4">
              <div className="grid h-10 w-10 place-items-center rounded-full border border-line-strong bg-raised text-sm font-semibold text-ink-2">{(current.sender ?? '?').slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{current.sender ?? 'Unknown sender'}</div>
                <div className="text-xs text-ink-3">{fmtTime(current.sentAt)}</div>
              </div>
              {current.status === 'unread' && (
                <Button size="sm" icon={<CheckCheck className="h-3.5 w-3.5" />} loading={read.isPending} onClick={() => markRead(current.id)}>Mark read</Button>
              )}
            </div>
            <div className="flex-1 whitespace-pre-wrap px-6 py-5 text-[15px] leading-relaxed text-ink-2">{current.body}</div>
          </>
        ) : (
          <Empty icon={<Mail />} title="Select a message" />
        )}
      </div>
    </Card>
  );
}

function AlertList({ probeId, kind }: { probeId: string; kind: 'alerts' | 'damage' }) {
  const game = useGame();
  const alertsQ = useAlerts(probeId);
  const damageQ = useDamage(probeId);
  const q = kind === 'alerts' ? alertsQ : damageQ;
  const key = kind === 'alerts' ? keys.alerts(probeId) : keys.damage(probeId);
  const read = useAction((id: string) => (kind === 'alerts' ? game.markAlertRead(probeId, id) : game.markDamageRead(probeId, id)), { label: 'Marking read…', success: 'Marked as read', invalidate: [key] });
  const del = useAction((id: string) => (kind === 'alerts' ? game.deleteAlert(probeId, id) : game.deleteDamage(probeId, id)), { label: 'Deleting…', success: 'Deleted', invalidate: [key] });
  const markAll = async () => {
    for (const a of q.data?.filter((x) => x.status === 'unread') ?? []) await read.mutateAsync(a.id).catch(() => undefined);
  };
  return (
    <Card>
      <CardHeader
        title={kind === 'alerts' ? 'Persistent alerts' : 'Movement damage warnings'}
        icon={kind === 'alerts' ? <Bell /> : <AlertTriangle />}
        actions={<Button size="xs" variant="ghost" icon={<CheckCheck className="h-3.5 w-3.5" />} disabled={!q.data?.some((a) => a.status === 'unread')} onClick={() => void markAll()}>Mark all read</Button>}
      />
      {q.error && <div className="p-4"><ErrorNote error={q.error} onRetry={() => q.refetch()} /></div>}
      <div className="divide-y divide-line">
        {q.data?.map((a) => (
          <div key={a.id} className="group flex items-start gap-4 px-5 py-4">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', a.status !== 'unread' ? 'bg-ink-4' : a.severity === 'warning' ? 'bg-warn' : a.severity === 'critical' || a.severity === 'error' ? 'bg-bad' : 'bg-accent')} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm', a.status === 'unread' ? 'font-semibold' : 'text-ink-2')}>{a.title}</span>
                {a.severity && <Badge tone={a.severity === 'warning' ? 'warn' : a.severity === 'critical' ? 'bad' : 'neutral'}>{a.severity}</Badge>}
                <span className="ml-auto text-xs text-ink-4">{fmtRelative(a.createdAt)}</span>
              </div>
              {a.message && <div className="mt-1 text-sm leading-relaxed text-ink-3">{a.message}</div>}
            </div>
            <div className="flex gap-1 opacity-60 transition-opacity group-hover:opacity-100">
              {a.status === 'unread' && <Button size="xs" variant="ghost" onClick={() => read.mutate(a.id)}>Read</Button>}
              <Button size="xs" variant="ghost" onClick={() => del.mutate(a.id)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
        {q.data && !q.data.length && <Empty icon={kind === 'alerts' ? <Bell /> : <AlertTriangle />} title="Nothing here">{kind === 'alerts' ? 'No alerts for this probe.' : 'No damage reported. Fly safe.'}</Empty>}
      </div>
    </Card>
  );
}

function Compose({ probeId, onClose }: { probeId: string; onClose: () => void }) {
  const game = useGame();
  const probes = useProbes();
  const sector = useSector(probeId);
  const planets = flattenObjects(sector.data?.sector?.objects ?? []).filter((o) => o.type === 'planet');
  const [type, setType] = useState<'probe' | 'planet'>('probe');
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const valid = to.trim() && body.trim() && body.length <= 2000 && (type === 'planet' || /^\d+$/.test(to));
  const send = useAction(() => game.sendMessage(probeId, { type, id: to.trim() }, body), { label: 'Transmitting…', success: 'Message sent' });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      icon={<Send />}
      title="New transmission"
      description="Reach another probe or an inhabited planet within range."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Send className="h-3.5 w-3.5" />} disabled={!valid} loading={send.isPending} onClick={() => send.mutate(undefined, { onSuccess: onClose })}>Send</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <Field label="Recipient type">
            <Select value={type} onChange={(e) => (setType(e.target.value as 'probe' | 'planet'), setTo(''))}>
              <option value="probe">Probe</option>
              <option value="planet">Planet</option>
            </Select>
          </Field>
          <Field label="Recipient">
            {type === 'probe' ? (
              <div className="flex gap-2">
                <Select value={probes.data?.some((p) => p.id === to) ? to : ''} onChange={(e) => setTo(e.target.value)}>
                  <option value="">Your probes…</option>
                  {probes.data?.filter((p) => p.id !== probeId).map((p) => <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>)}
                </Select>
                <Input className="num w-28" placeholder="or ID" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={planets.some((p) => p.id === to) ? to : ''} onChange={(e) => setTo(e.target.value)}>
                  <option value="">Planets in sector…</option>
                  {planets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Input className="num w-36" placeholder="or object ID" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            )}
          </Field>
        </div>
        <Field label="Message" hint={`${body.length} / 2000`}>
          <Textarea className="min-h-40" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} placeholder="Greetings from the Bobiverse…" />
        </Field>
      </div>
    </Dialog>
  );
}
