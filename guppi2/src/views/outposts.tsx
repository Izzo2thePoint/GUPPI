import { useMemo, useState } from 'react';
import { Anchor, Bot, Box, Factory, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGame } from '@/state/session';
import { keys, useAction, useMannies, useProbe, useSector, useSelectedProbeId } from '@/state/hooks';
import { useJobs } from '@/state/jobs';
import { useOutposts, type Outpost } from '@/state/outposts';
import { outpostJob, pauseOutpost, setupOutpost, startOutpost } from '@/state/outpost-runner';
import { SOLID_RESOURCES, asteroids, detachedContainers, isMoving, label, mannyReady, type Manny } from '@/core/models';
import { formatCoord, sameCoord } from '@/core/lattice';
import { errorMessage } from '@/core/errors';
import { fmtNumber, fmtRelative } from '@/core/format';
import { Badge, Button, Card, CardBody, CardHeader, Empty, Field, Input, Select, cn, type Tone } from '@/components/ui/primitives';
import { Confirm, Dialog } from '@/components/ui/dialog';
import { Meter } from '@/components/ui/data';
import { Page, PageHeader } from '@/components/shared';

const STATUS_TONE: Record<Outpost['status'], Tone> = { setup: 'neutral', ready: 'accent', running: 'ok', waiting: 'info', paused: 'neutral', complete: 'ok', blocked: 'bad' };

export default function Outposts() {
  const probeId = useSelectedProbeId();
  const all = useOutposts((s) => s.outposts);
  useJobs((s) => s.version); // re-render as jobs start and stop
  const mine = all.filter((o) => o.probeId === probeId);
  const [creating, setCreating] = useState(false);

  return (
    <Page>
      <PageHeader
        title="Mining outposts"
        subtitle="Station Mannies at an asteroid with a hidden container. GUPPI keeps sending them loads after you fly away, whenever your probe and the outpost share SCUT coverage."
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
            New outpost
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {mine.map((o) => (
            <OutpostCard key={o.id} outpost={o} />
          ))}
          {!mine.length && (
            <Card>
              <Empty icon={<Factory />} title="No outposts for this probe" action={<Button onClick={() => setCreating(true)}>Set up an outpost</Button>}>
                Park at an asteroid, hide a spare container on it, station some Mannies, and let them mine while you explore.
              </Empty>
            </Card>
          )}
        </div>
        <Card className="h-fit">
          <CardHeader title="How outposts work" icon={<Anchor />} />
          <CardBody className="space-y-3 text-sm leading-relaxed text-ink-2">
            {[
              ['Hide a container', 'A Manny detaches an additional container and hides it on the asteroid.'],
              ['Station the crew', 'Mannies mine into that container and stay at the asteroid between loads.'],
              ['Leave', 'Jump away whenever you like. The outpost keeps its own crew and storage.'],
              ['Keep mining over SCUT', 'While the probe is stopped and both sectors share a SCUT network, GUPPI orders the next load. Out of contact, it waits and never guesses.'],
              ['Come back', 'Recover the container to bring the ore home, and recall the crew.'],
            ].map(([t, d], i) => (
              <div key={t} className="flex gap-3">
                <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
                <div>
                  <div className="font-medium text-ink">{t}</div>
                  <div className="text-xs text-ink-3">{d}</div>
                </div>
              </div>
            ))}
            <p className="text-xs text-ink-3">GUPPI must be running for new loads to be ordered. Active outposts resume automatically when you reconnect.</p>
          </CardBody>
        </Card>
      </div>
      {creating && <CreateOutpost probeId={probeId} onClose={() => setCreating(false)} />}
    </Page>
  );
}

function OutpostCard({ outpost: o }: { outpost: Outpost }) {
  const game = useGame();
  const crew = useMannies(o.probeId);
  const probe = useProbe(o.probeId);
  const sector = useSector(o.probeId);
  const remove = useOutposts((s) => s.remove);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const running = !!outpostJob(o.id);
  const here = sameCoord(probe.data?.sector, o.coord) && !isMoving(probe.data);
  const pct = o.total ? Math.min(100, (o.mined / o.total) * 100) : 0;
  const team = o.mannyIds.map((id) => crew.data?.find((m) => m.id === id));
  const box = detachedContainers(sector.data?.sector).find((b) => o.containerIds.includes(b.id));
  const helper = crew.data?.find(mannyReady);

  const recover = useAction(() => game.mannyAction(o.probeId, helper!.id, 'recover-storage-container', { objectId: box!.id, source: 'asteroid' }), {
    label: 'Recovering outpost container…',
    success: 'Recovery started — the container comes back aboard with its ore',
    invalidate: [keys.mannies(o.probeId), keys.probe(o.probeId), keys.sector(o.probeId)],
  });
  const recall = useAction(
    async () => {
      for (const m of team) if (m && m.locationType !== 'probe') await game.mannyAction(o.probeId, m.id, 'recall');
    },
    { label: 'Recalling outpost crew…', success: 'Recall orders sent', invalidate: [keys.mannies(o.probeId)] },
  );

  const start = () => {
    try {
      startOutpost(game, o.id);
    } catch (e) {
      toast.error('Cannot start outpost', { description: errorMessage(e) });
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4 p-5">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
          <Factory className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{o.name}</span>
            <Badge tone={STATUS_TONE[o.status]} dot>
              {running && o.status !== 'waiting' ? 'Running' : label(o.status)}
            </Badge>
            {here && <Badge tone="info">Probe is here</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-ink-3">
            {o.targetName} · {label(o.resource)} · sector <span className="num">{formatCoord(o.coord)}</span> · updated {fmtRelative(o.updatedAt)}
          </div>
          <div className={cn('mt-2 text-sm', o.status === 'blocked' ? 'text-bad' : 'text-ink-2')}>{o.message}</div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {running ? (
            <Button size="sm" icon={<Pause className="h-3.5 w-3.5" />} onClick={() => pauseOutpost(o.id)}>
              Pause
            </Button>
          ) : (
            o.status !== 'complete' && (
              <Button size="sm" variant="primary" icon={<Play className="h-3.5 w-3.5" />} onClick={start}>
                {o.status === 'blocked' || o.status === 'paused' ? 'Resume' : 'Start'}
              </Button>
            )
          )}
        </div>
      </div>
      <div className="px-5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-ink-3">
            {o.loads} load{o.loads === 1 ? "" : "s"} · {fmtNumber(o.mined, 4)} of {fmtNumber(o.total, 4)} ECE
          </span>
          <span className="num text-ink-2">{Math.round(pct)}%</span>
        </div>
        <Meter value={pct} className="mt-1.5" />
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Crew</div>
          <div className="space-y-1.5">
            {o.mannyIds.map((id, i) => (
              <CrewLine key={id} manny={team[i]} id={id} outpost={o} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Storage</div>
          {o.containerIds.map((id) => {
            const b = detachedContainers(sector.data?.sector).find((x) => x.id === id);
            const full = o.fullContainerIds.includes(id);
            return (
              <div key={id} className="flex items-center gap-2 rounded-lg border border-line bg-white/[0.02] px-3 py-2 text-xs">
                <Box className="h-3.5 w-3.5 text-ink-3" />
                <span className="flex-1 truncate">{b?.name ?? id}</span>
                {b && typeof b.raw.freeCapacity === 'number' ? <span className="num text-ink-3">{fmtNumber(b.raw.freeCapacity, 3)} free</span> : <span className="text-ink-4">{here ? 'not visible' : 'seen when in range'}</span>}
                {full && <Badge tone="warn">Full</Badge>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-line px-5 py-3">
        <Button size="xs" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={recall.isPending} onClick={() => recall.mutate(undefined)}>
          Recall crew
        </Button>
        <Button size="xs" variant="ghost" icon={<Box className="h-3.5 w-3.5" />} disabled={!here || !box || !helper || running} loading={recover.isPending} onClick={() => recover.mutate(undefined)}>
          Recover container
        </Button>
        <div className="flex-1" />
        <Button size="xs" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(true)}>
          Forget
        </Button>
      </div>
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        danger
        title={`Forget outpost “${o.name}”?`}
        body="GUPPI stops ordering loads and removes the outpost from this list. Nothing changes in the game: the container and Mannies stay where they are."
        confirmLabel="Forget outpost"
        onConfirm={() => {
          pauseOutpost(o.id);
          remove(o.id);
        }}
      />
    </Card>
  );
}

function CrewLine({ manny: m, id, outpost: o }: { manny?: Manny; id: string; outpost: Outpost }) {
  const where = !m ? 'Missing' : m.locationType === 'probe' ? 'Aboard probe' : sameCoord(m.locationSector, o.coord) ? 'At outpost' : `At ${formatCoord(m.locationSector)}`;
  const tone: Tone = !m ? 'bad' : m.currentTask === 'unknown_too_far' ? 'warn' : m.currentTask === 'mining' ? 'accent' : m.currentTask ? 'info' : 'ok';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-white/[0.02] px-3 py-2 text-xs">
      <Bot className="h-3.5 w-3.5 text-ink-3" />
      <span className="flex-1 truncate font-medium">{m?.name ?? id}</span>
      <span className="text-ink-3">{where}</span>
      <Badge tone={tone}>{!m ? '—' : m.currentTask === 'unknown_too_far' ? 'Out of contact' : m.currentTask ? label(m.currentTask) : 'Idle'}</Badge>
      <span className="num w-16 text-right text-ink-4">{fmtNumber(o.remaining[id], 3)} left</span>
    </div>
  );
}

function CreateOutpost({ probeId, onClose }: { probeId: string; onClose: () => void }) {
  const game = useGame();
  const probe = useProbe(probeId);
  const sector = useSector(probeId);
  const crew = useMannies(probeId);
  const rocks = useMemo(() => asteroids(sector.data?.sector).filter((r) => r.resourceTypes?.some((x) => SOLID_RESOURCES.includes(x))), [sector.data]);
  const [picked, setTargetId] = useState('');
  const rock = rocks.find((r) => r.id === picked) ?? rocks[0];
  const targetId = rock?.id ?? '';
  const solids = (rock?.resourceTypes ?? []).filter((r) => SOLID_RESOURCES.includes(r));
  const [resource, setResource] = useState('');
  const res = resource || solids[0] || '';
  const existing = detachedContainers(sector.data?.sector).filter((b) => b.raw.targetObjectId === targetId);
  const aboard = (probe.data?.inventory?.containers ?? []).filter((c) => c.kind !== 'probe');
  const [container, setContainer] = useState('');
  const containerChoice = container || (existing[0] ? `existing:${existing[0].id}` : aboard[0] ? `detach:${aboard[0].id}` : '');
  const ready = (crew.data ?? []).filter((m) => mannyReady(m) || (m.locationType === 'sector' && sameCoord(m.locationSector, probe.data?.sector) && m.currentTask === null));
  const [chosen, setChosen] = useState<string[]>([]);
  const [total, setTotal] = useState('1');
  const [name, setName] = useState('');
  const moving = isMoving(probe.data);
  const reserve = rock?.resourceAmounts?.[res];
  const detachingWorker = containerChoice.startsWith('detach:') ? 1 : 0;
  const error = moving
    ? 'Stop in the asteroid’s sector first.'
    : !rock
      ? 'No asteroid with metals, ice or carbon here. Outposts need an asteroid.'
      : !res
        ? 'Choose a resource.'
        : !containerChoice
          ? 'You need a spare container aboard (or one already hidden on this asteroid).'
          : !chosen.length
            ? 'Choose the Mannies to station.'
            : !(Number(total) > 0)
              ? 'Enter how much to mine.'
              : null;

  const create = () => {
    try {
      setupOutpost(game, {
        probeId,
        name: name.trim() || `${rock!.name} outpost`,
        targetId: rock!.id,
        targetName: rock!.name,
        resource: res,
        mannyIds: chosen,
        total: Number(total),
        existingContainerId: containerChoice.startsWith('existing:') ? containerChoice.slice(9) : undefined,
        detachContainerId: containerChoice.startsWith('detach:') ? containerChoice.slice(7) : undefined,
      });
      toast.success('Setting up outpost', { description: 'Follow progress in Jobs. Mining starts as soon as the container is in place.' });
      onClose();
    } catch (e) {
      toast.error('Cannot create outpost', { description: errorMessage(e) });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      wide
      icon={<Factory />}
      title="New mining outpost"
      description={`Here at ${formatCoord(probe.data?.sector)}. After setup you can jump away; GUPPI keeps the crew busy over SCUT.`}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-warn">{error}</span>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!error} onClick={create}>
            Create outpost
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Asteroid">
          <Select value={targetId} onChange={(e) => (setTargetId(e.target.value), setResource(''), setContainer(''))}>
            {!rocks.length && <option value="">No suitable asteroid here</option>}
            {rocks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Resource" hint={reserve !== undefined ? `${fmtNumber(reserve, 3)} ECE remaining on the asteroid` : undefined}>
          <Select value={res} onChange={(e) => setResource(e.target.value)} disabled={!solids.length}>
            {solids.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Storage" className="col-span-full" hint="Deuterium can’t be stored in detached containers, so outposts mine solids.">
          <Select value={containerChoice} onChange={(e) => setContainer(e.target.value)}>
            {!existing.length && !aboard.length && <option value="">No spare container</option>}
            {existing.map((b) => (
              <option key={b.id} value={`existing:${b.id}`}>
                Use {b.name} already hidden on this asteroid
              </option>
            ))}
            {aboard.map((c) => (
              <option key={c.id} value={`detach:${c.id}`}>
                Hide {c.label} ({fmtNumber(c.capacity, 2)} capacity) on the asteroid — its contents go with it
              </option>
            ))}
          </Select>
        </Field>
        <Field group label="Mannies to station" className="col-span-full" hint={detachingWorker ? 'One free Manny first hides the container; it can also be part of the crew.' : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {ready.map((m) => {
              const on = chosen.includes(m.id);
              return (
                <button key={m.id} type="button" onClick={() => setChosen(on ? chosen.filter((x) => x !== m.id) : [...chosen, m.id])} className={cn('h-7 rounded-lg border px-2.5 text-xs', on ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line-strong text-ink-3')}>
                  {m.name}
                </button>
              );
            })}
            {!ready.length && <span className="text-xs text-ink-3">No free Mannies aboard.</span>}
          </div>
        </Field>
        <Field label="Total to mine (ECE)" hint={`About ${Math.ceil((Number(total) || 0) / 0.05)} loads of 0.05 ECE`}>
          <Input className="num" value={total} onChange={(e) => setTotal(e.target.value)} />
        </Field>
        <Field label="Name (optional)">
          <Input value={name} placeholder={rock ? `${rock.name} outpost` : ''} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
