import { useMemo, useState } from 'react';
import { ArrowLeftRight, Boxes, ChevronRight, Filter, Package, Rocket, Search, Settings2, Trash2 } from 'lucide-react';
import { useGame } from '@/state/session';
import { keys, useAction, useProbe, useSelectedProbeId } from '@/state/hooks';
import { usePickers } from '@/state/pickers';
import { operation, compile } from '@/core/catalog';
import { label, type Container, type InventoryItem, type ResourceStock } from '@/core/models';
import { fmtNumber } from '@/core/format';
import { Badge, Button, Card, CardHeader, Empty, ErrorNote, Field, Input, Select, Skeleton, Tip, cn } from '@/components/ui/primitives';
import { Confirm, Dialog } from '@/components/ui/dialog';
import { Meter } from '@/components/ui/data';
import { SchemaForm } from '@/components/schema-form';
import { Page, PageHeader, RenameButton } from '@/components/shared';
import { RESOURCE_COLORS } from '@/components/bits';

export default function Inventory() {
  const probeId = useSelectedProbeId();
  const probe = useProbe(probeId);
  const [query, setQuery] = useState('');
  const [move, setMove] = useState<Record<string, unknown> | null>(null);
  const [rules, setRules] = useState<Container | null>(null);
  const [jettison, setJettison] = useState<{ id: string; name: string; resource?: ResourceStock } | null>(null);
  const inv = probe.data?.inventory;

  const groups = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const i of inv?.items ?? []) {
      if (query && !`${i.type} ${i.name ?? ''}`.toLowerCase().includes(query.toLowerCase())) continue;
      map.set(i.type, [...(map.get(i.type) ?? []), i]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [inv, query]);

  if (probe.isLoading) return <Page><Skeleton className="h-96 rounded-card" /></Page>;
  if (probe.error) return <Page><ErrorNote error={probe.error} onRetry={() => probe.refetch()} /></Page>;
  if (!inv) return <Page><Empty icon={<Package />} title="Inventory unavailable">This probe is out of range or did not report its inventory.</Empty></Page>;

  const containerName = (id?: string) => inv.containers.find((c) => c.id === id)?.label ?? id ?? '—';
  const used = inv.usedCapacity ?? 0,
    cap = inv.capacity ?? 0;

  return (
    <Page>
      <PageHeader
        title="Inventory"
        subtitle={`${fmtNumber(used, 3)} of ${fmtNumber(cap, 3)} used · ${inv.items.length} items · ${inv.containers.length} containers`}
        actions={
          <Button variant="primary" size="sm" icon={<ArrowLeftRight className="h-3.5 w-3.5" />} onClick={() => setMove({})}>
            Move stock
          </Button>
        }
      />

      {/* Capacity strip */}
      <Card className="p-5">
        <div className="flex h-3 overflow-hidden rounded-full bg-raised">
          {inv.containers.map((c, i) => (
            <Tip key={c.id} content={`${c.label}: ${fmtNumber(c.usedCapacity, 3)} / ${fmtNumber(c.capacity, 3)}`}>
              <div
                className="h-full border-r border-void transition-all"
                style={{ width: `${cap ? ((c.usedCapacity ?? 0) / cap) * 100 : 0}%`, background: containerColor(i) }}
              />
            </Tip>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-3">
          {inv.containers.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: containerColor(i) }} />
              {c.label}
            </span>
          ))}
          <span className="ml-auto num">{fmtNumber(inv.freeCapacity, 3)} free</span>
        </div>
      </Card>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {inv.containers.map((c) => (
          <ContainerCard key={c.id} probeId={probeId} container={c} items={inv.items.filter((i) => i.containerId === c.id).length} onRules={() => setRules(c)} onMove={() => setMove({ fromContainerId: c.id })} />
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader title="Resources" subtitle="Raw materials by container" icon={<Boxes />} />
          <div className="divide-y divide-line">
            {inv.resourceStocks.map((r) => (
              <div key={r.id} className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: RESOURCE_COLORS[r.type] ?? 'var(--color-ink-3)' }} />
                  <span className="flex-1 text-sm font-medium">{r.name}</span>
                  <span className="num text-sm">{fmtNumber(r.amount, 4)}</span>
                  <Tip content="Jettison">
                    <button className="rounded-md p-1 text-ink-4 hover:bg-bad/10 hover:text-bad" onClick={() => setJettison({ id: r.id, name: r.name, resource: r })} aria-label={`Jettison ${r.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Tip>
                </div>
                <div className="mt-2 space-y-1">
                  {r.containers.map((c) => (
                    <div key={c.containerId} className="flex items-center gap-2 text-xs text-ink-3">
                      <span className="w-28 truncate">{c.label ?? containerName(c.containerId)}</span>
                      <Meter value={c.amount} max={Math.max(r.amount, 1e-9)} thin tone="neutral" />
                      <span className="num w-16 text-right">{fmtNumber(c.amount, 4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!inv.resourceStocks.length && <Empty icon={<Boxes />} title="No raw resources" />}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Parts & equipment"
            subtitle={`${inv.items.length} items in ${groups.length} types`}
            icon={<Package />}
            actions={
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" className="h-8 w-44 pl-8 text-xs" />
              </div>
            }
          />
          <div className="divide-y divide-line">
            {groups.map(([type, items]) => (
              <ItemGroup key={type} type={type} items={items} containerName={containerName} onJettison={(i) => setJettison({ id: i.id, name: i.name ?? label(i.type) })} />
            ))}
            {!groups.length && <Empty icon={<Filter />} title={query ? 'No matching items' : 'No items aboard'} />}
          </div>
        </Card>
      </div>

      {move && <MoveDialog probeId={probeId} initial={move} onClose={() => setMove(null)} />}
      {rules && <RulesDialog probeId={probeId} container={rules} types={[...new Set([...inv.items.map((i) => i.type), ...inv.resourceStocks.map((r) => r.type)])]} onClose={() => setRules(null)} />}
      {jettison && <JettisonDialog probeId={probeId} target={jettison} containers={inv.containers} onClose={() => setJettison(null)} />}
    </Page>
  );
}

function ContainerCard({ probeId, container: c, items, onRules, onMove }: { probeId: string; container: Container; items: number; onRules: () => void; onMove: () => void }) {
  const game = useGame();
  const rename = useAction((l: string) => game.renameContainer(probeId, c.id, l), { label: 'Renaming container…', invalidate: [keys.probe(probeId)] });
  const reassign = useAction(() => game.reassignReservations(probeId, c.id), { label: 'Reassigning crafting reservations…', invalidate: [keys.probe(probeId)] });
  const pct = c.capacity ? ((c.usedCapacity ?? 0) / c.capacity) * 100 : 0;
  const ruleCount = (c.rules?.priority.length ?? 0) + (c.rules?.exclusion.length ?? 0) + (c.rules?.strictExclusion.length ?? 0);
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {c.kind === 'probe' ? <Rocket className="h-4 w-4 shrink-0 text-ink-3" /> : <Package className="h-4 w-4 shrink-0 text-ink-3" />}
            <span className="truncate text-[15px] font-semibold">{c.label}</span>
            <RenameButton current={c.label} title="Rename container" onSave={(l) => rename.mutateAsync(l)} />
          </div>
          <div className="text-xs text-ink-3">
            {label(c.kind ?? 'container')} · {items} items
          </div>
        </div>
        <span className={cn('num text-sm font-semibold', pct > 90 ? 'text-bad' : pct > 70 ? 'text-warn' : 'text-ink')}>{Math.round(pct)}%</span>
      </div>
      <Meter value={pct} className="mt-4" tone={pct > 90 ? 'bad' : pct > 70 ? 'warn' : 'accent'} />
      <div className="num mt-2 flex justify-between text-xs text-ink-3">
        <span>{fmtNumber(c.usedCapacity, 3)} used</span>
        <span>{fmtNumber(c.freeCapacity, 3)} free</span>
      </div>
      {ruleCount > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {c.rules!.priority.map((t) => <Badge key={'p' + t} tone="ok">↑ {label(t)}</Badge>)}
          {c.rules!.exclusion.map((t) => <Badge key={'e' + t} tone="warn">✕ {label(t)}</Badge>)}
          {c.rules!.strictExclusion.map((t) => <Badge key={'s' + t} tone="bad">⛔ {label(t)}</Badge>)}
        </div>
      )}
      <div className="mt-4 flex gap-1.5">
        <Button size="xs" variant="ghost" icon={<Settings2 className="h-3.5 w-3.5" />} onClick={onRules}>
          Rules
        </Button>
        <Button size="xs" variant="ghost" icon={<ArrowLeftRight className="h-3.5 w-3.5" />} onClick={onMove}>
          Move from
        </Button>
        <Button size="xs" variant="ghost" loading={reassign.isPending} onClick={() => reassign.mutate(undefined)}>
          Reassign reservations
        </Button>
      </div>
    </Card>
  );
}

function ItemGroup({ type, items, containerName, onJettison }: { type: string; items: InventoryItem[]; containerName: (id?: string) => string; onJettison: (i: InventoryItem) => void }) {
  const [open, setOpen] = useState(false);
  const busy = items.filter((i) => i.currentTask).length;
  const byContainer = items.reduce<Record<string, number>>((m, i) => ((m[containerName(i.containerId)] = (m[containerName(i.containerId)] ?? 0) + 1), m), {});
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-raised">
        <ChevronRight className={cn('h-3.5 w-3.5 text-ink-4 transition-transform', open && 'rotate-90')} />
        <span className="flex-1 text-sm font-medium">{label(type)}</span>
        <span className="hidden text-xs text-ink-3 md:block">{Object.entries(byContainer).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
        {busy > 0 && <Badge tone="accent">{busy} in use</Badge>}
        <span className="num w-10 text-right text-sm font-semibold">×{items.length}</span>
      </button>
      {open && (
        <div className="border-t border-line bg-chrome">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-2 pl-12 pr-5 text-xs">
              <span className="num flex-1 truncate text-ink-3">{i.id}</span>
              <span className="text-ink-3">{containerName(i.containerId)}</span>
              {i.currentTask && <Badge tone="accent">{label(i.currentTask)}</Badge>}
              <button className="rounded-md p-1 text-ink-4 hover:bg-bad/10 hover:text-bad" onClick={() => onJettison(i)} aria-label="Jettison">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MoveDialog({ probeId, initial, onClose }: { probeId: string; initial: Record<string, unknown>; onClose: () => void }) {
  const game = useGame();
  const pickers = usePickers(probeId);
  const op = operation('POST /api/probe/{probeId}/storage-moves');
  const [body, setBody] = useState<Record<string, unknown>>({ kind: 'resource', ...initial });
  const error = useMemo(() => {
    try {
      compile({ operation: op.id, params: { probeId }, body });
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [body, op.id, probeId]);
  const send = useAction(() => game.storageMove(probeId, body), {
    label: 'Assigning storage move…',
    success: 'Move accepted',
    invalidate: [keys.probe(probeId), keys.mannies(probeId)],
    claim: { operation: op.id, probeId, body },
  });
  const kind = body.kind as string;
  const hide = ['quantity', ...(kind === 'resource' ? ['itemId', 'itemIds', 'targetMannyId', 'targetMannyIds'] : kind === 'item' ? ['resourceType', 'amount', 'targetMannyId', 'targetMannyIds', 'itemId'] : ['resourceType', 'amount', 'itemId', 'itemIds', 'targetMannyId'])];
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      wide
      icon={<ArrowLeftRight />}
      title="Move stock between containers"
      description="A Manny carries the stock. It must be aboard and idle."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!error} loading={send.isPending} onClick={() => send.mutate(undefined, { onSuccess: onClose })}>
            Assign move
          </Button>
        </>
      }
    >
      <SchemaForm schema={op.schema} value={body} onChange={setBody} pickers={pickers} hide={hide} />
      {error && Object.keys(body).length > 1 && <div className="mt-3 text-xs text-ink-3">{error}</div>}
    </Dialog>
  );
}

function RulesDialog({ probeId, container, types, onClose }: { probeId: string; container: Container; types: string[]; onClose: () => void }) {
  const game = useGame();
  const [r, setR] = useState(container.rules ?? { priority: [], exclusion: [], strictExclusion: [] });
  const all = [...new Set([...types, ...r.priority, ...r.exclusion, ...r.strictExclusion])].sort();
  const save = useAction(() => game.setRules(probeId, container.id, r), { label: 'Saving storage rules…', success: 'Rules saved', invalidate: [keys.probe(probeId)] });
  const state = (t: string) => (r.priority.includes(t) ? 'priority' : r.exclusion.includes(t) ? 'exclusion' : r.strictExclusion.includes(t) ? 'strictExclusion' : 'none');
  const cycle = (t: string) => {
    const order = ['none', 'priority', 'exclusion', 'strictExclusion'] as const;
    const next = order[(order.indexOf(state(t) as (typeof order)[number]) + 1) % order.length];
    const strip = (l: string[]) => l.filter((x) => x !== t);
    const out = { priority: strip(r.priority), exclusion: strip(r.exclusion), strictExclusion: strip(r.strictExclusion) };
    if (next !== 'none') out[next] = [...out[next], t];
    setR(out);
  };
  const [custom, setCustom] = useState('');
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      wide
      icon={<Settings2 />}
      title={`Routing rules · ${container.label}`}
      description="Click a type to cycle: preferred → excluded → strictly excluded → no rule."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>
            Save rules
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {all.map((t) => {
          const s = state(t);
          return (
            <button
              key={t}
              onClick={() => cycle(t)}
              className={cn(
                'h-8 rounded-lg border px-3 text-xs transition-colors',
                s === 'priority' && 'border-ok/40 bg-ok/10 text-ok',
                s === 'exclusion' && 'border-warn/40 bg-warn/10 text-warn',
                s === 'strictExclusion' && 'border-bad/40 bg-bad/10 text-bad',
                s === 'none' && 'border-line-strong text-ink-3 hover:text-ink-2',
              )}
            >
              {s === 'priority' ? '↑ ' : s === 'exclusion' ? '✕ ' : s === 'strictExclusion' ? '⛔ ' : ''}
              {label(t)}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <Input placeholder="Add another type id, e.g. solar_panel" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <Button
          disabled={!/^[a-z0-9_]+$/.test(custom.trim())}
          onClick={() => {
            setR({ ...r, priority: [...r.priority, custom.trim()] });
            setCustom('');
          }}
        >
          Add
        </Button>
      </div>
    </Dialog>
  );
}

function JettisonDialog({ probeId, target, containers, onClose }: { probeId: string; target: { id: string; name: string; resource?: ResourceStock }; containers: Container[]; onClose: () => void }) {
  const game = useGame();
  const [amount, setAmount] = useState('');
  const [containerId, setContainerId] = useState(target.resource?.containers[0]?.containerId ?? '');
  const body = target.resource ? { amount: Number(amount), ...(containerId ? { containerId } : {}) } : {};
  const valid = !target.resource || (Number(amount) > 0 && Number(amount) <= (target.resource.containers.find((c) => c.containerId === containerId)?.amount ?? target.resource.amount));
  const send = useAction(() => game.jettison(probeId, target.id, body), {
    label: `Jettisoning ${target.name}…`,
    success: `${target.name} jettisoned`,
    invalidate: [keys.probe(probeId)],
    claim: { operation: 'POST /api/probe/{probeId}/inventory/{itemId}/jettison', probeId, params: { itemId: target.id } },
  });
  return (
    <Confirm
      open
      onOpenChange={(v) => !v && onClose()}
      danger
      title={`Jettison ${target.name}?`}
      confirmLabel="Jettison"
      phrase="JETTISON"
      disabled={!valid}
      body={
        <div className="space-y-3">
          <p>Jettisoned cargo is lost into space. This cannot be undone.</p>
          {target.resource && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <Input className="num" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.05" />
              </Field>
              <Field label="From container">
                <Select value={containerId} onChange={(e) => setContainerId(e.target.value)}>
                  {target.resource.containers.map((c) => (
                    <option key={c.containerId} value={c.containerId}>
                      {c.label ?? containers.find((x) => x.id === c.containerId)?.label ?? c.containerId} ({fmtNumber(c.amount, 4)})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          {!valid && <p className="text-xs text-warn">Enter an amount up to what that container holds.</p>}
        </div>
      }
      onConfirm={() => send.mutateAsync(undefined)}
    />
  );
}

/** Distinct, similar-weight colours for containers in the capacity strip (hue and lightness both vary). */
const CONTAINER_HUES = [225, 165, 75, 300, 25, 195];
const containerColor = (i: number) => `oklch(${0.78 - (i % 2) * 0.08} 0.11 ${CONTAINER_HUES[i % CONTAINER_HUES.length]})`;
