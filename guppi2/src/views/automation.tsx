import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Compass, Copy, Factory, FlaskConical, Hammer, Hourglass, ListChecks, Pickaxe, Play, Plus, Radar, Save, Terminal, Trash2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { useGame } from '@/state/session';
import { MiningDialog } from '@/components/mining-dialog';
import { useProbe, useSelectedProbeId } from '@/state/hooks';
import { useJobs } from '@/state/jobs';
import { useNav } from '@/state/nav';
import { useRoutines } from '@/state/routines';
import { startRoutine, startScan, validateRoutine, type Routine, type RoutineStep } from '@/state/automations';
import { catalog, isRead, operation } from '@/core/catalog';
import { errorMessage } from '@/core/errors';
import { fmtRelative } from '@/core/format';
import { Badge, Button, Card, CardBody, CardHeader, Empty, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { JobCard } from '@/components/layout/jobs-drawer';
import { Page, PageHeader } from '@/components/shared';

export default function Automation() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const probe = useProbe(probeId);
  const jobs = useJobs((s) => s.jobs);
  const go = useNav((s) => s.go);
  const [mining, setMining] = useState(false);
  const mine = jobs.filter((j) => j.probeId === probeId).slice().reverse();

  return (
    <Page>
      <PageHeader title="Automation" subtitle="Long-running work that reserves Mannies and targets so nothing collides. Keep GUPPI open while jobs run." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Template icon={<Hammer />} title="Craft queue" text="Build many parts in parallel across idle Mannies." action="Open workshop" onClick={() => go('workshop')} />
        <Template icon={<Pickaxe />} title="Mining run" text="Split an amount into 0.05 ECE loads across several Mannies." action="Configure" onClick={() => setMining(true)} />
        <Template icon={<Factory />} title="Mining outpost" text="Leave Mannies mining at an asteroid after you jump away." action="Open outposts" onClick={() => go('outposts')} />
        <Template icon={<Compass />} title="Managed voyage" text="Jump with a fuel reserve and auto-scan on arrival." action="Open navigation" onClick={() => go('navigation')} />
        <Template icon={<Radar />} title="Neighbour sweep" text="Observe all 12 adjacent sectors into the archive." action="Sweep now" onClick={() => probe.data?.sector && startScan(game, probeId, probe.data.sector)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="Jobs for this probe" subtitle={`${mine.filter((j) => !j.finishedAt).length} running`} icon={<Workflow />} />
          <div className="space-y-2 p-4">
            {mine.map((j) => <JobCard key={j.id} job={j} />)}
            {!mine.length && <Empty icon={<Hourglass />} title="No jobs yet">Start one from a template or run a routine.</Empty>}
          </div>
        </Card>
        <RoutineBuilder probeId={probeId} />
      </div>
      {mining && <MiningDialog probeId={probeId} onClose={() => setMining(false)} />}
    </Page>
  );
}

function Template({ icon, title, text, action, onClick }: { icon: React.ReactNode; title: string; text: string; action: string; onClick: () => void }) {
  return (
    <Card className="group flex flex-col p-5">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</div>
      <div className="mt-3 font-semibold">{title}</div>
      <div className="mt-1 flex-1 text-xs leading-relaxed text-ink-3">{text}</div>
      <Button size="sm" className="mt-4 self-start" onClick={onClick}>
        {action}
      </Button>
    </Card>
  );
}

// ── Routine builder ──────────────────────────────────────────────────────────
const blank = (): Routine => ({ id: crypto.randomUUID(), name: 'New routine', steps: [], cycles: 1, interval: 60, updatedAt: Date.now() });
const newStep = (kind: RoutineStep['kind']): RoutineStep =>
  kind === 'wait'
    ? { id: crypto.randomUUID(), kind, seconds: 60 }
    : kind === 'until'
      ? { id: crypto.randomUUID(), kind, command: { operation: 'GET /api/probe/{probeId}/mannies', params: {} }, field: 'mannies.0.currentTask', expected: 'null', every: 30, timeout: 3600 }
      : { id: crypto.randomUUID(), kind, command: { operation: 'GET /api/probe/{probeId}', params: {} } };

function RoutineBuilder({ probeId }: { probeId: string }) {
  const game = useGame();
  const { routines, save, remove } = useRoutines();
  const [draft, setDraft] = useState<Routine | null>(null);
  const error = useMemo(() => {
    if (!draft) return null;
    try {
      validateRoutine(draft, probeId);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  }, [draft, probeId]);

  if (!draft)
    return (
      <Card>
        <CardHeader title="Routines" subtitle="Your own step-by-step automations, saved on this computer" icon={<ListChecks />} actions={<Button size="xs" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDraft(blank())}>New</Button>} />
        <div className="divide-y divide-line">
          {routines.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="text-xs text-ink-3">{r.steps.length} steps · {r.cycles} cycle(s) · edited {fmtRelative(r.updatedAt)}</div>
              </div>
              <Button size="xs" variant="ghost" icon={<FlaskConical className="h-3.5 w-3.5" />} onClick={() => run(r, true)}>Dry run</Button>
              <Button size="xs" icon={<Play className="h-3.5 w-3.5" />} onClick={() => run(r, false)}>Run</Button>
              <Button size="xs" variant="ghost" onClick={() => setDraft(structuredClone(r))}>Edit</Button>
            </div>
          ))}
          {!routines.length && <Empty icon={<ListChecks />} title="No routines yet">Chain any documented endpoint with waits and “until” conditions — e.g. craft, wait for the Manny, repeat.</Empty>}
        </div>
      </Card>
    );

  function run(r: Routine, dry: boolean) {
    try {
      startRoutine(game, probeId, r, dry);
      useNav.getState().setJobs(true);
    } catch (e) {
      toast.error('Cannot start routine', { description: errorMessage(e) });
    }
  }

  const update = (patch: Partial<Routine>) => setDraft({ ...draft, ...patch });
  const setStep = (i: number, s: RoutineStep) => update({ steps: draft.steps.map((x, j) => (j === i ? s : x)) });
  const moveStep = (i: number, d: number) => {
    const steps = [...draft.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(Math.max(0, Math.min(steps.length, i + d)), 0, s);
    update({ steps });
  };

  return (
    <Card>
      <CardHeader
        title="Edit routine"
        icon={<ListChecks />}
        actions={
          <>
            <Button size="xs" variant="ghost" onClick={() => setDraft(null)}>Close</Button>
            {routines.some((r) => r.id === draft.id) && (
              <Button size="xs" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => (remove(draft.id), setDraft(null))}>Delete</Button>
            )}
            <Button size="xs" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => setDraft({ ...draft, id: crypto.randomUUID(), name: `${draft.name} copy` })}>Duplicate</Button>
            <Button size="xs" variant="primary" icon={<Save className="h-3.5 w-3.5" />} onClick={() => save(draft)}>Save</Button>
          </>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-[1fr_100px_120px] gap-3">
          <Field label="Name"><Input value={draft.name} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label="Cycles"><Input className="num" type="number" value={draft.cycles} onChange={(e) => update({ cycles: Number(e.target.value) })} /></Field>
          <Field label="Pause between (s)"><Input className="num" type="number" value={draft.interval} onChange={(e) => update({ interval: Number(e.target.value) })} /></Field>
        </div>
        <div className="space-y-2">
          {draft.steps.map((s, i) => (
            <StepEditor key={s.id} index={i} step={s} onChange={(x) => setStep(i, x)} onRemove={() => update({ steps: draft.steps.filter((_, j) => j !== i) })} onMove={(d) => moveStep(i, d)} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Terminal className="h-3.5 w-3.5" />} onClick={() => update({ steps: [...draft.steps, newStep('command')] })}>Add command</Button>
          <Button size="sm" icon={<Hourglass className="h-3.5 w-3.5" />} onClick={() => update({ steps: [...draft.steps, newStep('wait')] })}>Add wait</Button>
          <Button size="sm" icon={<ListChecks className="h-3.5 w-3.5" />} onClick={() => update({ steps: [...draft.steps, newStep('until')] })}>Add “wait until”</Button>
        </div>
        {error ? <div className="text-xs text-warn">{error}</div> : <div className="text-xs text-ok">Routine is valid.</div>}
        <div className="flex gap-2 border-t border-line pt-4">
          <Button icon={<FlaskConical className="h-4 w-4" />} disabled={!!error} onClick={() => run(draft, true)}>Dry run</Button>
          <Button variant="primary" icon={<Play className="h-4 w-4" />} disabled={!!error} onClick={() => (save(draft), run(draft, false))}>Save & run</Button>
        </div>
      </CardBody>
    </Card>
  );
}

function StepEditor({ index, step, onChange, onRemove, onMove }: { index: number; step: RoutineStep; onChange: (s: RoutineStep) => void; onRemove: () => void; onMove: (d: number) => void }) {
  const ops = step.kind === 'until' ? catalog.filter((o) => isRead(o.id)) : catalog;
  const op = step.kind !== 'wait' ? operation(step.command.operation) : null;
  const [bodyText, setBodyText] = useState(step.kind !== 'wait' && step.command.body !== undefined ? JSON.stringify(step.command.body, null, 2) : '');
  const [bodyError, setBodyError] = useState<string | null>(null);
  const params = op?.parameters.filter((p) => p.name !== 'probeId') ?? [];
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] p-3.5">
      <div className="flex items-center gap-2">
        <Badge tone={step.kind === 'wait' ? 'neutral' : step.kind === 'until' ? 'warn' : 'accent'}>{index + 1} · {step.kind === 'until' ? 'wait until' : step.kind}</Badge>
        <div className="flex-1" />
        <button className="rounded p-1 text-ink-4 hover:text-ink" onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button className="rounded p-1 text-ink-4 hover:text-ink" onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button className="rounded p-1 text-ink-4 hover:text-bad" onClick={onRemove} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {step.kind === 'wait' ? (
        <Field label="Seconds" className="mt-3 max-w-40"><Input className="num" type="number" value={step.seconds} onChange={(e) => onChange({ ...step, seconds: Number(e.target.value) })} /></Field>
      ) : (
        <div className="mt-3 space-y-3">
          <Select value={step.command.operation} onChange={(e) => (onChange({ ...step, command: { operation: e.target.value, params: {} } }), setBodyText(''))}>
            {ops.map((o) => <option key={o.id} value={o.id}>{o.method} · {o.title}</option>)}
          </Select>
          {params.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {params.map((p) => (
                <Field key={p.name} label={`${p.name}${p.required ? ' *' : ''}`}>
                  <Input className="num" value={String(step.command.params?.[p.name] ?? '')} onChange={(e) => onChange({ ...step, command: { ...step.command, params: { ...step.command.params, [p.name]: e.target.value } } })} />
                </Field>
              ))}
            </div>
          )}
          {op?.body !== null && (
            <Field label="Body (JSON)" error={bodyError}>
              <Textarea
                className="num min-h-20 text-xs"
                value={bodyText}
                placeholder={JSON.stringify(op?.body ?? {}, null, 0)}
                onChange={(e) => {
                  setBodyText(e.target.value);
                  try {
                    const body = e.target.value.trim() ? JSON.parse(e.target.value) : undefined;
                    setBodyError(null);
                    onChange({ ...step, command: { ...step.command, body } });
                  } catch {
                    setBodyError('Invalid JSON');
                  }
                }}
              />
            </Field>
          )}
          {step.kind === 'until' && (
            <div className="grid gap-2 sm:grid-cols-4">
              <Field label="Response field" className="sm:col-span-2"><Input className="num" value={step.field} onChange={(e) => onChange({ ...step, field: e.target.value })} placeholder="mannies.0.currentTask" /></Field>
              <Field label="Equals (JSON)"><Input className="num" value={step.expected} onChange={(e) => onChange({ ...step, expected: e.target.value })} /></Field>
              <Field label="Poll every (s)"><Input className="num" type="number" value={step.every} onChange={(e) => onChange({ ...step, every: Number(e.target.value) })} /></Field>
              <Field label="Give up after (s)"><Input className="num" type="number" value={step.timeout} onChange={(e) => onChange({ ...step, timeout: Number(e.target.value) })} /></Field>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
