import { useState } from 'react';
import { Bot, Hammer, MapPin, Pickaxe, RotateCcw, Send, Users } from 'lucide-react';
import { useGame } from '@/state/session';
import { keys, useAction, useMannies, useNow, useSelectedProbeId } from '@/state/hooks';
import { useJobs } from '@/state/jobs';
import { label, mannyReady, type Manny } from '@/core/models';
import { fmtDuration, fmtPercent, secondsUntil } from '@/core/format';
import { formatCoord } from '@/core/lattice';
import { Badge, Button, Card, Empty, ErrorNote, Segmented, Skeleton, cn } from '@/components/ui/primitives';
import { Meter } from '@/components/ui/data';
import { OrderDialog } from '@/components/order-dialog';
import { Page, PageHeader, RenameButton } from '@/components/shared';
import { taskTone } from '@/components/bits';

type Filter = 'all' | 'ready' | 'busy' | 'away';

export default function Crew() {
  const probeId = useSelectedProbeId();
  const crew = useMannies(probeId);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<{ mannies: Manny[]; action?: string } | null>(null);
  const jobs = useJobs((s) => s.jobs);

  const all = crew.data ?? [];
  const list = all.filter((m) =>
    filter === 'ready' ? mannyReady(m) : filter === 'busy' ? !!m.currentTask : filter === 'away' ? m.locationType !== 'probe' : true,
  );
  const picked = all.filter((m) => selected.has(m.id));
  const reservedBy = (m: Manny) => jobs.find((j) => !j.finishedAt && j.probeId === probeId && j.claims.some((c) => c.key === `manny:${m.id}`));

  return (
    <Page>
      <PageHeader
        title="Crew"
        subtitle={`${all.filter(mannyReady).length} ready · ${all.filter((m) => m.currentTask).length} on task · ${all.filter((m) => m.locationType && m.locationType !== 'probe').length} outside`}
        actions={
          <>
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'ready', label: 'Ready' },
                { value: 'busy', label: 'Busy' },
                { value: 'away', label: 'Outside' },
              ]}
            />
            <Button variant="primary" size="sm" icon={<Users className="h-3.5 w-3.5" />} disabled={picked.length < 1} onClick={() => setOrder({ mannies: picked })}>
              Order {picked.length > 1 ? `${picked.length} selected` : 'selected'}
            </Button>
          </>
        }
      />
      {crew.error && <ErrorNote error={crew.error} onRetry={() => crew.refetch()} />}
      {crew.isLoading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-52 rounded-card" />
          ))}
        </div>
      )}
      {crew.data && !list.length && (
        <Card>
          <Empty icon={<Bot />} title="No Mannies match">
            Try a different filter.
          </Empty>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => (
          <MannyCard
            key={m.id}
            manny={m}
            probeId={probeId}
            selected={selected.has(m.id)}
            reservedBy={reservedBy(m)?.name}
            onSelect={() => {
              const next = new Set(selected);
              if (next.has(m.id)) next.delete(m.id);
              else next.add(m.id);
              setSelected(next);
            }}
            onOrder={(action) => setOrder({ mannies: [m], action })}
          />
        ))}
      </div>
      {order && <OrderDialog open onOpenChange={(v) => !v && setOrder(null)} probeId={probeId} mannies={order.mannies} initialAction={order.action} />}
    </Page>
  );
}

function MannyCard({
  manny: m,
  probeId,
  selected,
  reservedBy,
  onSelect,
  onOrder,
}: {
  manny: Manny;
  probeId: string;
  selected: boolean;
  reservedBy?: string;
  onSelect: () => void;
  onOrder: (action?: string) => void;
}) {
  const game = useGame();
  const now = useNow(1000);
  const left = secondsUntil(m.taskEnd, now);
  const ready = mannyReady(m);
  const outside = m.locationType && m.locationType !== 'probe';
  const rename = useAction((name: string) => game.renameManny(probeId, m.id, name), { label: 'Renaming Manny…', invalidate: [keys.mannies(probeId)] });
  const recall = useAction(() => game.mannyAction(probeId, m.id, 'recall'), {
    label: `Recalling ${m.name}…`,
    success: `${m.name} is heading back`,
    invalidate: [keys.mannies(probeId)],
  });
  const target = (m.task?.target as { name?: string } | undefined)?.name ?? (m.task?.objectId as string | undefined);
  const hue = [...m.id + m.name].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) % 360;

  return (
    <Card className={cn('flex flex-col transition-shadow', selected && 'border-accent-line')}>
      <div className="flex items-start gap-3 p-5 pb-4">
        <button
          onClick={onSelect}
          aria-label={selected ? 'Deselect' : 'Select'}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white/90"
          style={{ background: `oklch(0.42 0.08 ${hue})` }}
        >
          {m.name.slice(0, 2).toUpperCase()}
          <span className={cn('absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-panel', ready ? 'bg-ok' : m.currentTask ? 'bg-accent' : 'bg-ink-4')} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate font-semibold">{m.name}</span>
            <RenameButton current={m.name} title="Rename Manny" onSave={(n) => rename.mutateAsync(n)} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
            <MapPin className="h-3 w-3" />
            {outside ? `Outside · ${formatCoord(m.locationSector)}` : m.locationType === 'probe' ? 'Aboard' : label(m.locationType ?? 'unknown')}
          </div>
        </div>
        <Badge tone={taskTone(m.currentTask)}>{m.currentTask === null ? 'Ready' : label(m.currentTask ?? 'unknown')}</Badge>
      </div>
      <div className="flex-1 px-5">
        {m.currentTask ? (
          <div className="rounded-xl border border-line bg-chrome p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate text-ink-2">{target ? `Target: ${target}` : label(m.currentTask)}</span>
              <span className="num shrink-0 text-ink-3">{left !== undefined ? fmtDuration(left) : fmtPercent(m.progress)}</span>
            </div>
            <Meter value={m.progress} className="mt-2" />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong p-3 text-xs text-ink-3">{m.canReceiveOrders ? 'Awaiting orders.' : 'Cannot receive orders right now.'}</div>
        )}
        {reservedBy && <div className="mt-2 text-xs text-warn">Reserved by “{reservedBy}”</div>}
      </div>
      <div className="mt-4 flex gap-1.5 border-t border-line p-3">
        <Button size="xs" variant="ghost" icon={<Send className="h-3.5 w-3.5" />} disabled={!m.canReceiveOrders} onClick={() => onOrder()}>
          Order
        </Button>
        <Button size="xs" variant="ghost" icon={<Hammer className="h-3.5 w-3.5" />} disabled={!ready} onClick={() => onOrder('craft')}>
          Craft
        </Button>
        <Button size="xs" variant="ghost" icon={<Pickaxe className="h-3.5 w-3.5" />} disabled={!ready} onClick={() => onOrder('mine')}>
          Mine
        </Button>
        <div className="flex-1" />
        {outside && m.currentTask !== 'returning' && (
          <Button size="xs" variant="outline" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={recall.isPending} onClick={() => recall.mutate(undefined)}>
            Recall
          </Button>
        )}
      </div>
    </Card>
  );
}
