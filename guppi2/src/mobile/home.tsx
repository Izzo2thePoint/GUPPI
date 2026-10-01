import { useState } from 'react';
import { toast } from 'sonner';
import { Bell, Boxes, Bot, Droplets, Minus, Pickaxe, Plus, Radar, Rocket, ShieldCheck, XCircle } from 'lucide-react';
import { useGame, useSession } from '@/state/session';
import { keys, useAction, useAlerts, useMannies, useProbe, useSector, useSelectedProbeId } from '@/state/hooks';
import { useSettings } from '@/state/settings';
import { hasRefuelStation, isMoving, mannyReady, miningTargets } from '@/core/models';
import { formatCoord, hops, isValidSector, neighbors, sameCoord } from '@/core/lattice';
import { errorMessage } from '@/core/errors';
import { fmtNumber } from '@/core/format';
import { ProbeStatus } from '@/components/bits';
import { MovementPanel } from '@/components/shared';
import { MiningDialog } from '@/components/mining-dialog';
import { Badge, Button, Card, ErrorNote, Skeleton, cn } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { Readout } from '@/components/ui/data';
import { useRemoteStatus, useRunner } from './connection';
import { departureIssues, useOutposts, type Outpost } from '@/state/outposts';

export function HomeScreen() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const probe = useProbe(probeId);
  const crew = useMannies(probeId);
  const alerts = useAlerts(probeId);
  const runner = useRunner();
  const [sheet, setSheet] = useState<'jump' | 'mine' | 'fuel' | null>(null);
  const cancel = useAction(() => game.cancelMove(probeId), {
    label: 'Cancelling jump…',
    success: 'Jump cancelled',
    invalidate: [keys.probe(probeId), keys.probes],
  });

  const p = probe.data;
  if (probe.isLoading) return <div className="space-y-3 p-4"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>;
  if (probe.error) return <div className="p-4"><ErrorNote error={probe.error} onRetry={() => probe.refetch()} /></div>;
  if (!p) return null;

  const inv = p.inventory;
  const cargo = inv?.capacity ? ((inv.usedCapacity ?? 0) / inv.capacity) * 100 : undefined;
  const fuel = p.deuteriumCapacity ? ((p.deuterium ?? 0) / p.deuteriumCapacity) * 100 : p.deuterium;
  const mannies = crew.data ?? [];
  const ready = mannies.filter(mannyReady).length;
  const unread = alerts.data?.filter((a) => a.status === 'unread') ?? [];
  const moving = isMoving(p);

  const scan = async () => {
    try {
      await runner.scan(probeId);
      toast.success('Scanning the 12 neighbouring sectors', { description: runner.onPc ? 'Running on your PC.' : 'Keep the app open until it finishes.' });
    } catch (e) {
      toast.error('Cannot scan', { description: errorMessage(e) });
    }
  };

  return (
    <div className="space-y-3 p-4">
      <div className="px-1 pt-1">
        <div className="truncate text-[28px] font-semibold leading-tight tracking-[-0.025em]">{p.name}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] text-ink-3">
          <ProbeStatus status={p.status} />
          <span>
            Sector <span className="mono text-ink-2">{formatCoord(p.sector)}</span>
          </span>
        </div>
      </div>
      <Card className="space-y-4 rounded-xl p-4">
        <Readout label="Hull integrity" icon={<ShieldCheck />} value={p.integrity} unit="%" />
        <Readout label="Deuterium" icon={<Droplets />} value={fuel} unit="%" />
        <Readout label="Cargo" icon={<Boxes />} value={cargo} unit="%" invert />
      </Card>

      {moving && p.movement && (
        <Card className="rounded-2xl p-4">
          <MovementPanel movement={p.movement} status={p.status} />
          {p.status === 'preparing' && (
            <Button variant="danger" className="mt-3 w-full" icon={<XCircle className="h-4 w-4" />} loading={cancel.isPending} onClick={() => cancel.mutate(undefined)}>
              Cancel jump
            </Button>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <QuickAction icon={<Rocket />} title="Jump" sub={moving ? 'In transit' : 'Plot a course'} disabled={moving} onClick={() => setSheet('jump')} />
        <QuickAction icon={<Radar />} title="Scan" sub="12 neighbours" disabled={moving} onClick={() => void scan()} />
        <QuickAction icon={<Pickaxe />} title="Mine" sub={`${ready} Mannies ready`} disabled={moving} onClick={() => setSheet('mine')} />
        <QuickAction icon={<Droplets />} title="Refuel" sub={fuel !== undefined ? `${Math.round(fuel)}% tank` : 'Tank'} disabled={moving} onClick={() => setSheet('fuel')} />
      </div>

      <Card className="grid grid-cols-2 divide-x divide-line rounded-2xl">
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3"><Bot className="h-3.5 w-3.5" /> Crew</div>
          <div className="num mt-1 text-xl font-semibold">{crew.data ? `${ready}/${mannies.length}` : '—'}</div>
          <div className="text-xs text-ink-3">{mannies.filter((m) => m.currentTask).length} on task</div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3"><Bell className="h-3.5 w-3.5" /> Alerts</div>
          <div className={cn('num mt-1 text-xl font-semibold', unread.length && 'text-accent')}>{unread.length}</div>
          <div className="truncate text-xs text-ink-3">{unread[0]?.title ?? 'All quiet'}</div>
        </div>
      </Card>

      {runner.onPc && <p className="px-2 text-center text-[12px] text-ink-4">Automations you start here run on your PC and keep going when your phone sleeps.</p>}

      {sheet === 'jump' && <JumpSheet onClose={() => setSheet(null)} />}
      {sheet === 'mine' && <MiningDialog probeId={probeId} onClose={() => setSheet(null)} run={(o) => runner.miningRun(probeId, o)} />}
      {sheet === 'fuel' && <FuelSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

function QuickAction({ icon, title, sub, onClick, disabled }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="surface flex min-h-[72px] flex-col justify-center rounded-xl px-4 py-3 text-left transition-colors active:bg-raised disabled:opacity-45">
      <span className="flex items-center gap-2 font-semibold">
        <span className="text-accent [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</span>
        {title}
      </span>
      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{sub}</span>
    </button>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <div className="flex w-full items-center overflow-hidden rounded-2xl border border-line-strong bg-void/60">
        <button aria-label={`${label} minus`} className="grid h-11 w-9 shrink-0 place-items-center text-ink-2 active:bg-raised" onClick={() => onChange(value - 1)}>
          <Minus className="h-4 w-4" />
        </button>
        <input
          aria-label={label}
          className="num h-11 w-0 min-w-0 flex-1 bg-transparent text-center text-[16px] outline-none"
          value={String(value)}
          inputMode="numeric"
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^\d-]/g, ''));
            if (Number.isInteger(n)) onChange(n);
          }}
        />
        <button aria-label={`${label} plus`} className="grid h-11 w-9 shrink-0 place-items-center text-ink-2 active:bg-raised" onClick={() => onChange(value + 1)}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function JumpSheet({ onClose }: { onClose: () => void }) {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const probe = useProbe(probeId);
  const crew = useMannies(probeId);
  const runner = useRunner();
  // Outposts live on the PC in remote mode, on this phone otherwise.
  const pc = useRemoteStatus(runner.onPc);
  const local = useOutposts((s) => s.outposts);
  const outposts = (runner.onPc ? (pc.data?.outposts ?? []) : local) as Outpost[];
  const issues = departureIssues(outposts, probeId, probe.data?.sector, crew.data ?? []);
  const [leaving, setLeaving] = useState(false);
  const here = probe.data?.sector ?? { x: 0, y: 0, z: 0 };
  const [t, setT] = useState(here);
  const [armed, setArmed] = useState(!useSettings.getState().confirmMutations);
  const valid = isValidSector(t) && !sameCoord(t, here);
  const jump = useAction(() => game.move(probeId, t), {
    label: `Engaging jump to ${formatCoord(t)}…`,
    success: 'Jump accepted — preparing drive',
    invalidate: [keys.probe(probeId), keys.probes],
    claim: { operation: 'POST /api/probe/{probeId}/move', probeId },
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      icon={<Rocket />}
      title="Plot a jump"
      description={`From ${formatCoord(here)}. X + Y + Z must be even.`}
      footer={
        issues.length ? (
          <div className="grid w-full gap-2">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!valid}
              loading={leaving}
              onClick={async () => {
                setLeaving(true);
                try {
                  await runner.leave(probeId, t);
                  toast.success('Leaving once the outpost crew is ready', { description: runner.onPc ? 'Running on your PC.' : 'Keep the app open until the probe jumps.' });
                  onClose();
                } catch (e) {
                  toast.error('Cannot plan the departure', { description: errorMessage(e) });
                } finally {
                  setLeaving(false);
                }
              }}
            >
              Leave when crew is ready
            </Button>
            <Button variant="ghost" className="w-full" disabled={!valid} loading={jump.isPending} onClick={() => (armed ? jump.mutate(undefined, { onSuccess: onClose }) : setArmed(true))}>
              {armed ? 'Tap again: jump and bring them back' : 'Jump now'}
            </Button>
          </div>
        ) : (
          <Button
            variant={armed ? 'primary' : 'secondary'}
            size="lg"
            className="w-full"
            disabled={!valid}
            loading={jump.isPending}
            onClick={() => (armed ? jump.mutate(undefined, { onSuccess: onClose }) : setArmed(true))}
          >
            {armed ? `Engage → ${formatCoord(t)}` : 'Review jump'}
          </Button>
        )
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          <Stepper label="X" value={t.x} onChange={(x) => (setT({ ...t, x }), setArmed(false))} />
          <Stepper label="Y" value={t.y} onChange={(y) => (setT({ ...t, y }), setArmed(false))} />
          <Stepper label="Z" value={t.z} onChange={(z) => (setT({ ...t, z }), setArmed(false))} />
        </div>
        <div className="flex items-center justify-center gap-2 text-sm">
          {isValidSector(t) ? <Badge tone="accent">{hops(here, t)} hop{hops(here, t) === 1 ? '' : 's'}</Badge> : <Badge tone="warn">X + Y + Z must be even</Badge>}
          <Badge>{fmtNumber(probe.data?.deuterium, 1)} deuterium</Badge>
        </div>
        <div>
          <div className="mb-2 text-xs text-ink-3">Neighbours</div>
          <div className="grid grid-cols-3 gap-1.5">
            {neighbors(here).map((c) => (
              <button key={`${c.x},${c.y},${c.z}`} onClick={() => (setT(c), setArmed(false))} className={cn('num h-10 rounded-xl border text-xs', sameCoord(c, t) ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line-strong text-ink-2 active:bg-raised')}>
                {formatCoord(c)}
              </button>
            ))}
          </div>
        </div>
        {issues.length > 0 && (
          <div className="rounded-2xl border border-warn/25 bg-warn/[0.06] px-3.5 py-3 text-xs leading-relaxed text-warn">
            <div className="font-medium">Outpost crew isn't ready to stay behind</div>
            <ul className="mt-1 list-disc pl-4">
              {issues.map((i) => (
                <li key={i.manny}>{i.text}</li>
              ))}
            </ul>
          </div>
        )}
        {armed && valid && !issues.length && <p className="text-center text-xs text-warn">Tap again to engage. Movement can only be cancelled while the drive prepares.</p>}
      </div>
    </Dialog>
  );
}

function FuelSheet({ onClose }: { onClose: () => void }) {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const sector = useSector(probeId);
  const crew = useMannies(probeId);
  const probe = useProbe(probeId);
  const runner = useRunner();
  const mode = useSession((s) => s.mode);
  const [mining, setMining] = useState(false);
  const station = hasRefuelStation(sector.data?.sector);
  const sources = miningTargets(sector.data?.sector).filter((t) => t.resourceTypes.includes('deuterium'));
  const worker = (crew.data ?? []).find(mannyReady);
  const fill = useAction(() => game.mannyAction(probeId, worker!.id, 'refill-deuterium-tank'), {
    label: 'Refilling the tank…',
    success: 'Refuelling started (about a minute)',
    invalidate: [keys.probe(probeId), keys.mannies(probeId)],
    claim: { operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/refill-deuterium-tank', probeId, params: { mannyId: worker?.id } },
  });
  if (mining) return <MiningDialog probeId={probeId} presetResource="deuterium" onClose={onClose} run={(o) => runner.miningRun(probeId, o)} />;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} icon={<Droplets />} title="Refuel" description={`Tank ${fmtNumber(probe.data?.deuterium, 1)} / ${probe.data?.deuteriumCapacity ?? 100} points`}>
      <div className="space-y-3">
        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-center gap-2 font-medium">
            Refuel station {station ? <Badge tone="ok">Here</Badge> : <Badge>None detected</Badge>}
          </div>
          <p className="mt-1 text-xs text-ink-3">A Manny fills the tank to the maximum in about a minute.</p>
          <Button className="mt-3 w-full" variant={station ? 'primary' : 'secondary'} disabled={!worker || !station} loading={fill.isPending} onClick={() => fill.mutate(undefined, { onSuccess: onClose })}>
            {worker ? `Fill tank with ${worker.name}` : 'No Manny ready aboard'}
          </Button>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-center gap-2 font-medium">
            Mine deuterium {sources.length ? <Badge tone="ok">{sources.length} source{sources.length === 1 ? '' : 's'}</Badge> : <Badge>None here</Badge>}
          </div>
          <p className="mt-1 text-xs text-ink-3">0.01 ECE = 1 tank point, up to 5 points per Manny trip{mode === 'remote' ? '. Runs on your PC.' : '.'}</p>
          <Button className="mt-3 w-full" disabled={!sources.length} icon={<Pickaxe className="h-4 w-4" />} onClick={() => setMining(true)}>
            Mine deuterium…
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
