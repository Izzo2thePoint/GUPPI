/**
 * Workshop → Build a probe: the parts list for `assemble-probe`, what is aboard,
 * what it takes to make the rest, and the assembly order itself.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Cpu, Hammer, ListPlus, Pickaxe, Rocket, TriangleAlert } from 'lucide-react';
import { useGame } from '@/state/session';
import { useMannies, useProbe, useRecipes, useSelectedProbeId } from '@/state/hooks';
import { startCraftQueue } from '@/state/automations';
import { ASSEMBLY_SECONDS, PROBE_MODELS, planAssembly, type ProbeModel } from '@/core/assembly';
import { isMoving, label, mannyReady } from '@/core/models';
import { fmtDuration, fmtNumber } from '@/core/format';
import { Badge, Button, Card, CardBody, CardHeader, ErrorNote, Segmented, Skeleton, cn } from '@/components/ui/primitives';
import { Readout } from '@/components/ui/data';
import { OrderDialog } from '@/components/order-dialog';
import { MiningDialog } from '@/components/mining-dialog';

export function BuildProbe() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const probe = useProbe(probeId);
  const recipes = useRecipes();
  const crew = useMannies(probeId);
  const [model, setModel] = useState<ProbeModel>('generic');
  const [assemble, setAssemble] = useState(false);
  const [mine, setMine] = useState<string | null>(null);
  const inv = probe.data?.inventory;
  const plan = useMemo(() => (recipes.data ? planAssembly(model, inv, recipes.data) : null), [model, inv, recipes.data]);
  const ready = (crew.data ?? []).filter(mannyReady);
  const hasPrinter = !!inv?.items.some((i) => i.type === 'atomic_3d_printer');

  if (recipes.error || probe.error) return <ErrorNote error={recipes.error ?? probe.error} onRetry={() => (recipes.refetch(), probe.refetch())} />;
  if (!plan) return <Skeleton className="h-96 rounded-card" />;

  const short = plan.parts.filter((p) => p.short > 0);
  const containersShort = Math.max(0, plan.containers.need - plan.containers.empty.length);
  const rawMissing = Object.entries(plan.build.missing).filter(([t]) => !plan.unobtainable.includes(t));
  const blockedByPrinter = plan.build.needsPrinter && !hasPrinter;
  const canQueue = (short.some((p) => p.craftable) || containersShort > 0) && !rawMissing.length && !blockedByPrinter;
  const recipeFor = (type: string) => recipes.data!.find((r) => r.outputType === type);

  const queueMissing = () => {
    const lines = [...short.filter((p) => p.craftable).map((p) => ({ type: p.type, n: p.short })), ...(containersShort ? [{ type: 'additional_container', n: containersShort }] : [])];
    let started = 0;
    for (const { type, n } of lines) {
      const r = recipeFor(type);
      if (!r) continue;
      const printer = r.craftableBy.includes('atomic_3d_printer') && !r.craftableBy.includes('manny');
      startCraftQueue(game, probeId, { recipeId: r.id, recipeName: r.name, count: n, printer, waitForCompletion: true });
      started++;
    }
    toast.success(`Queued ${started} craft job${started === 1 ? '' : 's'} for the ${PROBE_MODELS.find((m) => m.id === model)!.name.toLowerCase()}`, {
      description: 'They share the crew and wait their turn for the atomic printer. Track them under Jobs.',
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Segmented value={model} onChange={setModel} options={PROBE_MODELS.map((m) => ({ value: m.id, label: m.name }))} />
            <p className="mt-2 text-[13px] text-ink-3">{PROBE_MODELS.find((m) => m.id === model)!.summary}</p>
          </div>
          <Readout
            className="w-72"
            label={plan.ready ? 'Ready to assemble' : 'Parts in hand'}
            value={plan.progress * 100}
            display={`${Math.round(plan.progress * 100)}`}
            unit="%"
            tone={plan.ready ? 'ok' : 'accent'}
          />
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] font-medium text-ink-3">
                <th className="px-5 py-2.5 font-medium">Part</th>
                <th className="px-3 py-2.5 text-right font-medium">Needed</th>
                <th className="px-3 py-2.5 text-right font-medium">Aboard</th>
                <th className="px-3 py-2.5 font-medium">Made by</th>
                <th className="px-5 py-2.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {plan.parts.map((p) => (
                <tr key={p.type}>
                  <td className="px-5 py-2.5 font-medium">{label(p.type)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-2">{p.need}</td>
                  <td className={cn('num px-3 py-2.5 text-right', p.short ? 'text-ink-2' : 'text-ok')}>{p.have}</td>
                  <td className="px-3 py-2.5 text-ink-3">
                    {!p.craftable ? (
                      'Find or salvage'
                    ) : p.printer ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5" /> Atomic printer
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Hammer className="h-3.5 w-3.5" /> Manny
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {p.short ? (
                      <Badge tone={p.craftable ? 'warn' : 'bad'}>{p.short} short</Badge>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12.5px] text-ok">
                        <Check className="h-3.5 w-3.5" /> Ready
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-5 py-2.5">
                  <div className="font-medium">Empty additional containers</div>
                  <div className="text-[12px] text-ink-3">
                    {plan.containers.empty.length ? plan.containers.empty.map((c) => c.label).join(', ') : 'None aboard are empty'} · they become the hull
                  </div>
                </td>
                <td className="num px-3 py-2.5 text-right text-ink-2">{plan.containers.need}</td>
                <td className={cn('num px-3 py-2.5 text-right', containersShort ? 'text-ink-2' : 'text-ok')}>{plan.containers.empty.length}</td>
                <td className="px-3 py-2.5 text-ink-3">{recipeFor('additional_container') ? 'Manny, or empty one' : 'Empty one aboard'}</td>
                <td className="px-5 py-2.5 text-right">
                  {containersShort ? (
                    <Badge tone="warn">{containersShort} short</Badge>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[12.5px] text-ok">
                      <Check className="h-3.5 w-3.5" /> Ready
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="What the rest takes" subtitle={short.length || containersShort ? 'Using what is aboard first' : 'Nothing left to make'} />
          <CardBody className="space-y-4 text-[13.5px]">
            {Object.keys(plan.build.prepare).length > 0 && (
              <div>
                <div className="mb-1.5 text-[12.5px] text-ink-3">Parts to craft</div>
                <ul className="space-y-1">
                  {Object.entries(plan.build.prepare).map(([t, n]) => (
                    <li key={t} className="flex justify-between">
                      <span>{label(t)}</span>
                      <span className="num text-ink-2">× {fmtNumber(n, 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Object.keys(plan.build.raw).length > 0 && (
              <div>
                <div className="mb-1.5 text-[12.5px] text-ink-3">Raw materials (ECE)</div>
                <ul className="space-y-1">
                  {Object.entries(plan.build.raw).map(([t, n]) => {
                    const miss = plan.build.missing[t];
                    return (
                      <li key={t} className="flex justify-between">
                        <span>{label(t)}</span>
                        <span className={cn('num', miss ? 'text-bad' : 'text-ink-2')}>
                          {fmtNumber(n, 3)}
                          {miss ? ` · ${fmtNumber(miss, 3)} short` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {plan.build.durationSeconds > 0 && (
              <p className="text-ink-3">
                About <span className="num text-ink-2">{fmtDuration(plan.build.durationSeconds)}</span> of crafting in total, shared between idle Mannies.
              </p>
            )}
            {plan.unobtainable.length > 0 && (
              <p className="flex gap-2 text-warn">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                No recipe here for {plan.unobtainable.map(label).join(', ')}. Salvage wrecks or check the game for another source.
              </p>
            )}
            {blockedByPrinter && <p className="text-bad">Some parts need the atomic printer, and this probe has none aboard.</p>}
            {rawMissing.length > 0 && (
              <div className="space-y-2">
                <p className="text-bad">Mine the missing raw materials first, then queue the parts.</p>
                <div className="flex flex-wrap gap-2">
                  {rawMissing.map(([t]) => (
                    <Button key={t} size="sm" icon={<Pickaxe className="h-3.5 w-3.5" />} onClick={() => setMine(t)}>
                      Mine {label(t).toLowerCase()}…
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <Button className="w-full" icon={<ListPlus className="h-4 w-4" />} disabled={!canQueue} onClick={queueMissing}>
              Queue the missing parts
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Assemble" subtitle={`${fmtDuration(ASSEMBLY_SECONDS)} exterior task`} />
          <CardBody className="space-y-3 text-[13.5px] text-ink-2">
            <p>A Manny builds the probe outside in this sector, then transfers to it as its first crew member.</p>
            <p className="text-ink-3">Stay in this sector until it finishes. If the probe leaves early, the Manny is left behind.</p>
            <Button
              variant="primary"
              className="w-full"
              icon={<Rocket className="h-4 w-4" />}
              disabled={!plan.ready || !ready.length || isMoving(probe.data)}
              onClick={() => setAssemble(true)}
            >
              Assemble the {PROBE_MODELS.find((m) => m.id === model)!.name.toLowerCase()}
            </Button>
            {!plan.ready && <p className="text-[12.5px] text-ink-3">Available once every part and both containers are ready.</p>}
            {plan.ready && !ready.length && <p className="text-[12.5px] text-ink-3">Waiting for an idle Manny aboard.</p>}
          </CardBody>
        </Card>
      </div>

      {mine && <MiningDialog probeId={probeId} presetResource={mine} onClose={() => setMine(null)} />}
      {assemble && ready[0] && (
        <OrderDialog
          open
          onOpenChange={(v) => !v && setAssemble(false)}
          probeId={probeId}
          mannies={[ready[0]]}
          initialAction="assemble-probe"
          initialBody={{ model, containerIds: plan.containers.empty.slice(0, 2).map((c) => c.id) }}
        />
      )}
    </div>
  );
}
