import { useMemo, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Check, Clock, Cpu, Droplets, Hammer, ListPlus, Rocket, Search, ShieldPlus, Sparkles, Wrench, X } from 'lucide-react';
import { useGame } from '@/state/session';
import { keys, useAction, useImprovements, useMannies, useProbe, useRecipes, useSelectedProbeId } from '@/state/hooks';
import { startCraftQueue } from '@/state/automations';
import { canCraft, maxCraftable, planCraft, stockOf } from '@/core/craft';
import { label, mannyReady, type Improvement, type Manny, type Recipe } from '@/core/models';
import { fmtDuration, fmtNumber } from '@/core/format';
import { Badge, Button, Card, CardBody, CardHeader, Empty, ErrorNote, Field, Input, Select, Skeleton, Switch, cn } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { Meter, Ring } from '@/components/ui/data';
import { OrderDialog } from '@/components/order-dialog';
import { Page, PageHeader } from '@/components/shared';

const tabCls =
  'h-9 rounded-[10px] px-4 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink-2 data-[state=active]:bg-raised data-[state=active]:text-ink data-[state=active]:shadow-[0_0_0_1px_var(--color-line-strong)]';

export default function Workshop() {
  return (
    <Page>
      <PageHeader title="Workshop" subtitle="Craft parts, install upgrades, repair and refuel." />
      <Tabs.Root defaultValue="craft">
        <Tabs.List className="mb-5 inline-flex gap-1 rounded-xl border border-line bg-void/40 p-1">
          <Tabs.Trigger value="craft" className={tabCls}>Crafting</Tabs.Trigger>
          <Tabs.Trigger value="upgrades" className={tabCls}>Upgrades</Tabs.Trigger>
          <Tabs.Trigger value="maintenance" className={tabCls}>Repairs & fuel</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="craft"><Crafting /></Tabs.Content>
        <Tabs.Content value="upgrades"><Upgrades /></Tabs.Content>
        <Tabs.Content value="maintenance"><Maintenance /></Tabs.Content>
      </Tabs.Root>
    </Page>
  );
}

function Crafting() {
  const probeId = useSelectedProbeId();
  const recipes = useRecipes();
  const probe = useProbe(probeId);
  const crew = useMannies(probeId);
  const [query, setQuery] = useState('');
  const [onlyPossible, setOnlyPossible] = useState(false);
  const [queue, setQueue] = useState<Recipe | null>(null);
  const inv = probe.data?.inventory;
  const hasPrinter = !!inv?.items.some((i) => i.type === 'atomic_3d_printer');
  const stock = useMemo(() => stockOf(inv, probe.data?.deuterium), [inv, probe.data?.deuterium]);
  const ready = (crew.data ?? []).filter(mannyReady);

  const list = useMemo(
    () =>
      (recipes.data ?? [])
        .map((r) => {
          let plan = null,
            error = null as string | null;
          try {
            plan = planCraft(r, recipes.data!, inv, probe.data?.deuterium);
          } catch (e) {
            error = (e as Error).message;
          }
          return { r, plan, error, ok: plan ? canCraft(plan, hasPrinter) : false };
        })
        .filter(({ r, ok }) => (!query || `${r.name} ${r.id}`.toLowerCase().includes(query.toLowerCase())) && (!onlyPossible || ok)),
    [recipes.data, inv, probe.data?.deuterium, hasPrinter, query, onlyPossible],
  );

  if (recipes.error) return <ErrorNote error={recipes.error} onRetry={() => recipes.refetch()} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes" className="w-64 pl-8" />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <Switch checked={onlyPossible} onChange={setOnlyPossible} /> Craftable now
        </label>
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-3">
          <Badge tone={ready.length ? 'ok' : 'neutral'}>{ready.length} Mannies ready</Badge>
          <Badge tone={hasPrinter ? 'accent' : 'neutral'}>
            <Cpu className="h-3 w-3" /> {hasPrinter ? 'Atomic printer aboard' : 'No atomic printer'}
          </Badge>
        </div>
      </div>
      {(recipes.isLoading || probe.isLoading) && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-56 rounded-card" />)}</div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map(({ r, plan, ok, error }) => (
          <RecipeCard key={r.id} recipe={r} stock={stock} plan={plan} ok={ok} error={error} ready={ready} probeId={probeId} hasPrinter={hasPrinter} onQueue={() => setQueue(r)} />
        ))}
      </div>
      {recipes.data && !list.length && <Empty icon={<Hammer />} title="No recipes match" />}
      {queue && <QueueDialog recipe={queue} probeId={probeId} crew={crew.data ?? []} hasPrinter={hasPrinter} max={maxCraftable(queue, recipes.data ?? [], inv, hasPrinter)} onClose={() => setQueue(null)} />}
    </>
  );
}

function RecipeCard({
  recipe: r,
  stock,
  plan,
  ok,
  error,
  ready,
  probeId,
  hasPrinter,
  onQueue,
}: {
  recipe: Recipe;
  stock: Record<string, number>;
  plan: ReturnType<typeof planCraft> | null;
  ok: boolean;
  error: string | null;
  ready: Manny[];
  probeId: string;
  hasPrinter: boolean;
  onQueue: () => void;
}) {
  const game = useGame();
  const printer = r.craftableBy.includes('atomic_3d_printer') && !r.craftableBy.includes('manny');
  const craft = useAction(
    () => (printer ? game.printerCraft(probeId, r.id) : game.mannyAction(probeId, ready[0].id, 'craft', { recipe: r.id })),
    () => ({
      label: printer ? `Printing ${r.name}…` : `${ready[0]?.name} crafting ${r.name}…`,
      success: `${r.name} started`,
      invalidate: [keys.mannies(probeId), keys.probe(probeId)],
      claim: printer
        ? { operation: 'POST /api/probe/{probeId}/atomic-printer/craft', probeId }
        : { operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/craft', probeId, params: { mannyId: ready[0]?.id } },
    }),
  );
  const prepare = plan ? Object.entries(plan.prepare) : [];
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 p-5 pb-3">
        <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', printer ? 'bg-accent-2/15 text-accent-2' : 'bg-accent-soft text-accent')}>
          {printer ? <Cpu className="h-4 w-4" /> : <Hammer className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{r.name}</div>
          <div className="flex items-center gap-2 whitespace-nowrap text-xs text-ink-3">
            <Clock className="h-3 w-3 shrink-0" /> {fmtDuration(plan?.durationSeconds ?? r.durationSeconds)}
            <span>·</span>
            {printer ? 'Atomic printer' : 'Manny'}
            {r.outputSpace !== undefined && <span>· {r.outputSpace} space</span>}
          </div>
        </div>
        {ok ? <Badge tone="ok"><Check className="h-3 w-3" /> Ready</Badge> : <Badge tone="neutral"><X className="h-3 w-3" /> Short</Badge>}
      </div>
      <div className="flex-1 space-y-2 px-5">
        {r.ingredients.map((i) => {
          const have = stock[i.type] ?? 0;
          const enough = have + 1e-9 >= i.quantity;
          return (
            <div key={i.type} className="flex items-center gap-2 text-xs">
              <span className={cn('h-1.5 w-1.5 rounded-full', enough ? 'bg-ok' : plan?.prepare[i.type] ? 'bg-warn' : 'bg-bad')} />
              <span className="flex-1 text-ink-2">{label(i.type)}</span>
              <span className="num text-ink-3">
                {fmtNumber(Math.min(have, 9999), 3)} / {fmtNumber(i.quantity, 3)}
                {i.unit !== 'item' && <span className="ml-1 text-ink-4">ece</span>}
              </span>
            </div>
          );
        })}
        {prepare.length > 0 && (
          <div className="rounded-lg border border-warn/20 bg-warn/[0.05] px-2.5 py-1.5 text-[11px] text-warn/90">
            Will first prepare: {prepare.map(([k, v]) => `${v}× ${label(k)}`).join(', ')}
          </div>
        )}
        {plan && Object.keys(plan.missing).length > 0 && (
          <div className="rounded-lg border border-bad/20 bg-bad/[0.05] px-2.5 py-1.5 text-[11px] text-bad/90">
            Missing: {Object.entries(plan.missing).map(([k, v]) => `${label(k)} ${+v.toFixed(4)}`).join(', ')}
          </div>
        )}
        {plan?.needsPrinter && !hasPrinter && <div className="text-[11px] text-bad">Requires an atomic printer aboard.</div>}
        {error && <div className="text-[11px] text-bad">{error}</div>}
      </div>
      <div className="mt-4 flex gap-2 border-t border-line p-3">
        <Button size="sm" variant="primary" className="flex-1" disabled={!ok || !ready.length} loading={craft.isPending} onClick={() => craft.mutate(undefined)}>
          Craft now
        </Button>
        <Button size="sm" icon={<ListPlus className="h-3.5 w-3.5" />} onClick={onQueue}>
          Queue
        </Button>
      </div>
    </Card>
  );
}

function QueueDialog({ recipe, probeId, crew, hasPrinter, max, onClose }: { recipe: Recipe; probeId: string; crew: Manny[]; hasPrinter: boolean; max: number; onClose: () => void }) {
  const game = useGame();
  const printer = recipe.craftableBy.includes('atomic_3d_printer') && !recipe.craftableBy.includes('manny');
  const [count, setCount] = useState(String(Math.max(1, Math.min(max, 5))));
  const [who, setWho] = useState('any');
  const [wait, setWait] = useState(true);
  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1 && n <= 500 && (!printer || hasPrinter);
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      icon={<ListPlus />}
      title={`Queue ${recipe.name}`}
      description="GUPPI orders one at a time, waiting for an idle Manny and re-checking materials before every order."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              startCraftQueue(game, probeId, { recipeId: recipe.id, recipeName: recipe.name, count: n, printer, mannyIds: who === 'any' ? undefined : [who], waitForCompletion: wait });
              onClose();
            }}
          >
            Start queue
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How many" hint={`Current stock supports about ${max}.`}>
          <Input className="num" value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        {!printer && (
          <Field label="Crafter">
            <Select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="any">Any idle Manny (parallel)</option>
              {crew.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <label className="col-span-full flex items-center justify-between rounded-xl border border-line px-3.5 py-3 text-sm">
          <span>
            Wait for the last item to finish
            <div className="text-xs text-ink-3">Otherwise the job ends once every order is accepted.</div>
          </span>
          <Switch checked={wait} onChange={setWait} />
        </label>
      </div>
    </Dialog>
  );
}

function Upgrades() {
  const probeId = useSelectedProbeId();
  const imps = useImprovements(probeId);
  const crew = useMannies(probeId);
  const probe = useProbe(probeId);
  const [order, setOrder] = useState<{ action: string; body?: Record<string, unknown> } | null>(null);
  const stock = stockOf(probe.data?.inventory);
  const ready = (crew.data ?? []).filter(mannyReady);
  return (
    <>
      {imps.error && <ErrorNote error={imps.error} onRetry={() => imps.refetch()} />}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {imps.data?.map((i) => <UpgradeCard key={i.id} imp={i} stock={stock} canStart={!!ready.length} onInstall={() => setOrder({ action: 'improve-probe', body: { improvement: i.id } })} />)}
        <Card className="flex flex-col p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><Rocket className="h-4 w-4" /></div>
            <div>
              <div className="font-semibold">Assemble a new probe</div>
              <div className="text-xs text-ink-3">Replicate — build a drone probe or deuterium tanker from containers.</div>
            </div>
          </div>
          <div className="flex-1" />
          <Button className="mt-5" disabled={!ready.length} onClick={() => setOrder({ action: 'assemble-probe' })} icon={<Sparkles className="h-3.5 w-3.5" />}>
            Plan assembly
          </Button>
        </Card>
      </div>
      {imps.data && !imps.data.length && <Empty icon={<Sparkles />} title="No upgrades listed" />}
      {order && ready[0] && <OrderDialog open onOpenChange={(v) => !v && setOrder(null)} probeId={probeId} mannies={[ready[0]]} initialAction={order.action} initialBody={order.body} />}
    </>
  );
}

function UpgradeCard({ imp, stock, canStart, onInstall }: { imp: Improvement; stock: Record<string, number>; canStart: boolean; onInstall: () => void }) {
  const enough = imp.ingredients.every((i) => (stock[i.type] ?? 0) + 1e-9 >= i.quantity);
  return (
    <Card className={cn('flex flex-col p-5', imp.done && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Sparkles className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{imp.name}</div>
          {imp.description && <div className="mt-0.5 text-xs leading-relaxed text-ink-3">{imp.description}</div>}
        </div>
        {imp.done ? <Badge tone="ok">Installed</Badge> : !imp.available ? <Badge>Locked</Badge> : !imp.installableOnProbe ? <Badge tone="warn">Not for probes</Badge> : null}
      </div>
      <div className="mt-4 flex-1 space-y-1.5">
        {imp.ingredients.map((i) => (
          <div key={i.type} className="flex items-center gap-2 text-xs">
            <span className={cn('h-1.5 w-1.5 rounded-full', (stock[i.type] ?? 0) >= i.quantity ? 'bg-ok' : 'bg-bad')} />
            <span className="flex-1 text-ink-2">{label(i.type)}</span>
            <span className="num text-ink-3">{fmtNumber(stock[i.type] ?? 0, 3)} / {i.quantity}</span>
          </div>
        ))}
        {imp.durationSeconds !== undefined && <div className="pt-1 text-xs text-ink-3">Takes {fmtDuration(imp.durationSeconds)}</div>}
      </div>
      {!imp.done && imp.available && imp.installableOnProbe && (
        <Button className="mt-4" variant={enough ? 'primary' : 'secondary'} disabled={!canStart} onClick={onInstall}>
          {enough ? 'Install' : 'Install (materials short)'}
        </Button>
      )}
    </Card>
  );
}

function Maintenance() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const probe = useProbe(probeId);
  const crew = useMannies(probeId);
  const ready = (crew.data ?? []).filter(mannyReady);
  const [who, setWho] = useState('');
  const [pct, setPct] = useState(5);
  const manny = ready.find((m) => m.id === who) ?? ready[0];
  const integrity = probe.data?.integrity;
  const repair = useAction(() => game.mannyAction(probeId, manny!.id, 'repair', { integrityPercent: pct }), {
    label: `Repairing ${pct}% integrity…`,
    success: 'Repair started',
    invalidate: [keys.mannies(probeId), keys.probe(probeId)],
    claim: { operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/repair', probeId, params: { mannyId: manny?.id } },
  });
  const refuel = useAction(() => game.mannyAction(probeId, manny!.id, 'refill-deuterium-tank'), {
    label: 'Refilling deuterium…',
    success: 'Refuelling started',
    invalidate: [keys.mannies(probeId), keys.probe(probeId)],
    claim: { operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/refill-deuterium-tank', probeId, params: { mannyId: manny?.id } },
  });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Hull integrity" subtitle="Manny repairs consume materials" icon={<ShieldPlus />} />
        <CardBody className="flex items-center gap-8">
          <Ring value={integrity} size={120} stroke={9}>
            <div className="num text-2xl font-semibold">{integrity ?? '—'}<span className="text-sm text-ink-3">%</span></div>
          </Ring>
          <div className="flex-1 space-y-4">
            <Field label={`Repair amount: ${pct}%`}>
              <input type="range" min={1} max={Math.max(1, 100 - (integrity ?? 0))} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="accent-[var(--accent)]" />
            </Field>
            <MannyPicker ready={ready} value={manny?.id ?? ''} onChange={setWho} />
            <Button variant="primary" icon={<Wrench className="h-4 w-4" />} disabled={!manny || (integrity ?? 100) >= 100} loading={repair.isPending} onClick={() => repair.mutate(undefined)}>
              Start repair
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Deuterium" subtitle="Refill the tank from onboard ice" icon={<Droplets />} />
        <CardBody className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="num text-3xl font-semibold">{probe.data?.deuterium ?? '—'}<span className="text-base text-ink-3">%</span></span>
            <span className="text-xs text-ink-3">Ice aboard: <span className="num">{fmtNumber(stockOf(probe.data?.inventory).ice ?? 0, 3)}</span></span>
          </div>
          <Meter value={probe.data?.deuterium} tone={(probe.data?.deuterium ?? 0) < 30 ? 'warn' : 'accent'} />
          <MannyPicker ready={ready} value={manny?.id ?? ''} onChange={setWho} />
          <Button variant="primary" icon={<Droplets className="h-4 w-4" />} disabled={!manny} loading={refuel.isPending} onClick={() => refuel.mutate(undefined)}>
            Refill tank
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function MannyPicker({ ready, value, onChange }: { ready: Manny[]; value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Manny">
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={!ready.length}>
        {!ready.length && <option>No Manny ready</option>}
        {ready.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </Select>
    </Field>
  );
}
