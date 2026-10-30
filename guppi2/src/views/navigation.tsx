import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Gauge, Navigation2, Radar, Rocket, Star, Trash2 } from 'lucide-react';
import { useGame } from '@/state/session';
import { keys, useAction, useFleet, useProbe, useSector, useSelectedProbeId, useVisited } from '@/state/hooks';
import { useArchive } from '@/state/archive';
import { departureIssues, useOutposts } from '@/state/outposts';
import { useSettings } from '@/state/settings';
import { useNav } from '@/state/nav';
import { startScan, startVoyage } from '@/state/automations';
import { coordKey, formatCoord, hops, isValidSector, neighbors, planLegs, sameCoord } from '@/core/lattice';
import { hasRefuelStation, isMoving, label, miningTargets, scutRelays, type Coord, type Sector, type SectorObject } from '@/core/models';
import { Fields, factChips } from '@/components/observation';
import { fmtRelative } from '@/core/format';
import { GameApiError } from '@/core/errors';
import { Badge, Button, Card, CardBody, CardHeader, Empty, ErrorNote, Field, Input, Segmented, Switch, cn } from '@/components/ui/primitives';
import { Confirm, Dialog } from '@/components/ui/dialog';
import { JsonView } from '@/components/ui/data';
import { StarMap } from '@/components/star-map';
import { ObjectIcon, objectTone } from '@/components/bits';
import { MovementPanel, Page, PageHeader } from '@/components/shared';
import { OrderDialog } from '@/components/order-dialog';
import { MiningDialog } from '@/components/mining-dialog';
import { useMannies, useSector as useSectorQuery } from '@/state/hooks';
import { mannyReady } from '@/core/models';

export default function Navigation() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const probe = useProbe(probeId);
  const fleet = useFleet();
  const sector = useSector(probeId);
  const visited = useVisited();
  const archive = useArchive();
  const confirmFirst = useSettings((s) => s.confirmMutations);
  const maxHop = useSettings((s) => s.maxHop);
  const setSettings = useSettings((s) => s.set);
  const [target, setTarget] = useState<Coord | null>(null);
  const [xyz, setXyz] = useState<[string, string, string]>(['', '', '']);
  const [mode, setMode] = useState<'jump' | 'voyage'>('jump');
  const [scanOnArrival, setScanOnArrival] = useState(true);
  const [reserve, setReserve] = useState('20');
  const [confirm, setConfirm] = useState(false);
  const [inspect, setInspect] = useState<SectorObject | null>(null);
  const [bookmarkName, setBookmarkName] = useState('');

  const p = probe.data;
  const here = p?.sector;
  const outposts = useOutposts((x) => x.outposts);
  const crewList = useMannies(probeId).data ?? [];
  const crewIssues = departureIssues(outposts, probeId, here, crewList);
  const moving = isMoving(p);

  const parsed = useMemo(() => {
    if (xyz.every((v) => v === '')) return null;
    if (xyz.some((v) => !/^-?\d+$/.test(v.trim()))) return { error: 'Whole numbers only' };
    const c = { x: +xyz[0], y: +xyz[1], z: +xyz[2] };
    if (!isValidSector(c)) return { error: 'X + Y + Z must be even' };
    return { c };
  }, [xyz]);
  const dest = parsed && 'c' in parsed ? parsed.c : null;
  // The jumps GUPPI will actually fly: at most `maxHop` sectors each.
  const legs = useMemo(() => {
    if (!dest || !here) return [];
    try {
      return planLegs(here, dest, maxHop);
    } catch {
      return [];
    }
  }, [dest, here, maxHop]);
  const route = useMemo(() => (here && legs.length ? [here, ...legs] : undefined), [here, legs]);
  const distance = dest && here ? hops(here, dest) : null;
  const jumps = legs.length;

  const pick = (c: Coord) => {
    setTarget(c);
    setXyz([String(c.x), String(c.y), String(c.z)]);
  };

  // Fleet → Locate: target that probe's sector and fly the map to it.
  const mapTarget = useNav((s) => s.mapTarget);
  const [flyTo, setFlyTo] = useState<Coord | null>(null);
  useEffect(() => {
    if (!mapTarget) return;
    pick(mapTarget);
    setFlyTo(mapTarget);
    useNav.setState({ mapTarget: null });
  }, [mapTarget]);

  const jump = useAction(() => game.move(probeId, dest!), {
    label: `Engaging jump to ${formatCoord(dest ?? undefined)}…`,
    success: 'Jump accepted — preparing drive',
    invalidate: [keys.probe(probeId), keys.probes],
    claim: { operation: 'POST /api/probe/{probeId}/move', probeId },
  });

  // Leave only once the outpost crew stands at the asteroid (see outposts.ts), then jump.
  const leaveWhenReady = () => dest && startVoyage(game, probeId, p?.name ?? probeId, [dest], { scanOnArrival: false, minDeuterium: 0 });
  const engage = () => {
    if (!dest) return;
    if (mode === 'voyage') {
      startVoyage(game, probeId, p?.name ?? probeId, [dest], { scanOnArrival, minDeuterium: Number(reserve) || 0 });
      return;
    }
    // Further than one allowed jump: fly it as a series of jumps rather than one long move.
    if (jumps > 1) {
      startVoyage(game, probeId, p?.name ?? probeId, [dest], { scanOnArrival: false, minDeuterium: 0 });
      return;
    }
    jump.mutate(undefined);
  };

  const scanHere = () => here && startScan(game, probeId, here);
  const scans = Object.values(archive.sectors);
  const targetSummary = target ? archive.sectors[coordKey(target)] : undefined;
  const targetBookmark = target ? archive.bookmarks[coordKey(target)] : undefined;

  return (
    <Page>
      <PageHeader
        title="Navigation"
        subtitle={here ? `${p?.name} is at ${formatCoord(here)} · ${scans.length} sectors archived` : 'Loading position…'}
        actions={
          <Button icon={<Radar className="h-4 w-4" />} disabled={!here} onClick={scanHere}>
            Scan 12 neighbours
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card className="p-1.5">
            <StarMap
              className="h-[560px]"
              probes={fleet.probes}
              selectedProbeId={probeId}
              visited={(visited.data ?? []).map((v) => v.coord)}
              scans={scans}
              bookmarks={Object.values(archive.bookmarks)}
              outposts={outposts.filter((o) => !['complete', 'blocked'].includes(o.status))}
              focus={here}
              target={dest}
              flyTo={flyTo}
              route={route}
              onPick={pick}
            />
          </Card>

          <Card>
            <CardHeader
              title="Local sector"
              subtitle={sector.data?.sector ? `${label(sector.data.sector.knowledgeLevel ?? 'unknown')} knowledge · SCUT ${label(sector.data.sector.scutCoverage ?? 'unknown')}` : 'External sensors'}
              icon={<Radar />}
              actions={
                <Button size="xs" variant="ghost" loading={sector.isFetching} onClick={() => sector.refetch()}>
                  Refresh
                </Button>
              }
            />
            {moving && <Empty icon={<Gauge />} title="Sensors unavailable in transit">They come back online when the probe slows down.</Empty>}
            {sector.error &&
              (sector.error instanceof GameApiError && sector.error.code === 'sensors_unavailable' ? (
                <Empty icon={<Gauge />} title="Sensors unavailable">
                  {sector.error.message}
                </Empty>
              ) : (
                <CardBody>
                  <ErrorNote error={sector.error} onRetry={() => sector.refetch()} />
                </CardBody>
              ))}
            {sector.data?.sector && <SectorReadout sector={sector.data.sector} onInspect={setInspect} />}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Helm" subtitle={moving ? 'Jump in progress' : 'Plot a course'} icon={<Navigation2 />} />
            <CardBody className="space-y-4">
              {p?.movement && moving && <MovementPanel movement={p.movement} status={p.status} />}
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'jump', label: 'Single jump' },
                  { value: 'voyage', label: 'Managed voyage' },
                ]}
                className="w-full [&>button]:flex-1"
              />
              <div className="grid grid-cols-3 gap-2">
                {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                  <Field key={axis} label={axis}>
                    <Input
                      className="num text-center"
                      inputMode="numeric"
                      value={xyz[i]}
                      onChange={(e) => {
                        const next = [...xyz] as [string, string, string];
                        next[i] = e.target.value;
                        setXyz(next);
                        setTarget(null);
                      }}
                      placeholder={String(here ? [here.x, here.y, here.z][i] : 0)}
                    />
                  </Field>
                ))}
              </div>
              {parsed && 'error' in parsed && <div className="text-xs text-bad">{parsed.error}</div>}
              {dest && here && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <MiniStat label="Hops" value={distance ?? '—'} />
                  <MiniStat label="Jumps" value={jumps || '—'} />
                  <MiniStat label="Deuterium" value={`${p?.deuterium ?? '—'}%`} />
                  <MiniStat label="Archived" value={archive.sectors[coordKey(dest)] ? 'Yes' : 'No'} />
                </div>
              )}
              <Field label="Sectors per jump" hint={`Longer trips become a series of jumps. ${jumps > 1 ? `This one: ${jumps} jumps.` : ''}`}>
                <Input
                  className="num w-24"
                  inputMode="numeric"
                  value={String(maxHop)}
                  onChange={(e) => {
                    const v = Math.floor(Number(e.target.value));
                    if (Number.isFinite(v) && v >= 1 && v <= 50) setSettings({ maxHop: v });
                  }}
                />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {here &&
                  neighbors(here).slice(0, 6).map((c) => (
                    <button key={coordKey(c)} onClick={() => pick(c)} className="num rounded-md border border-line px-1.5 py-0.5 text-[12px] text-ink-3 hover:border-accent/40 hover:text-ink">
                      {formatCoord(c)}
                    </button>
                  ))}
              </div>
              {mode === 'voyage' && (
                <div className="space-y-3 rounded-xl border border-line bg-chrome p-3.5">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      Scan neighbours on arrival
                      <div className="text-xs text-ink-3">Fills the star map as you travel.</div>
                    </span>
                    <Switch checked={scanOnArrival} onChange={setScanOnArrival} />
                  </label>
                  <Field label="Keep a deuterium reserve (%)" hint="The voyage refuses to jump below this.">
                    <Input className="num" value={reserve} onChange={(e) => setReserve(e.target.value)} />
                  </Field>
                </div>
              )}
              {crewIssues.length > 0 && (
                <div className="rounded-xl border border-warn/25 bg-warn/[0.06] px-3 py-2.5 text-xs leading-relaxed text-warn">
                  <div className="font-medium">Outpost crew isn't ready to stay behind</div>
                  <ul className="mt-1 list-disc pl-4 text-warn/90">
                    {crewIssues.map((i) => (
                      <li key={i.manny}>{i.text}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-warn/80">
                    {mode === 'voyage'
                      ? 'The voyage holds new loads and waits for them to stand at the asteroid before jumping.'
                      : 'Jumping now pulls them back aboard. Leave when ready holds new loads, waits for them, then jumps.'}
                  </p>
                </div>
              )}
              {crewIssues.length > 0 && mode === 'jump' ? (
                <div className="grid gap-2">
                  <Button variant="primary" className="w-full" size="lg" icon={<Rocket className="h-4 w-4" />} disabled={!dest || moving || !here || sameCoord(dest, here)} onClick={leaveWhenReady}>
                    Leave when crew is ready
                  </Button>
                  <Button variant="ghost" className="w-full" disabled={!dest || moving || !here || sameCoord(dest, here)} loading={jump.isPending} onClick={() => (confirmFirst ? setConfirm(true) : engage())}>
                    Jump now and bring them back
                  </Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  className="w-full"
                  size="lg"
                  icon={<Rocket className="h-4 w-4" />}
                  disabled={!dest || moving || !here || sameCoord(dest, here)}
                  loading={jump.isPending}
                  onClick={() => (confirmFirst ? setConfirm(true) : engage())}
                >
                  {mode === 'voyage' ? 'Start voyage' : jumps > 1 ? `Engage · ${jumps} jumps` : 'Engage'}
                </Button>
              )}
              <p className="text-xs leading-relaxed text-ink-3">Coordinates are relative to your home sector. A jump can only be cancelled while the drive is preparing.</p>
            </CardBody>
          </Card>

          {target && (
            <Card>
              <CardHeader title={`Sector ${formatCoord(target)}`} subtitle={targetSummary ? `Observed ${fmtRelative(targetSummary.observedAt)}` : 'Not yet observed'} icon={<Crosshair />} />
              <CardBody className="space-y-3 text-sm">
                {targetSummary ? (
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="Star systems" value={targetSummary.stars} />
                    <MiniStat label="Planets" value={targetSummary.planets} />
                    <MiniStat label="Asteroids" value={targetSummary.asteroids} />
                    <MiniStat label="Habitable" value={targetSummary.habitable} />
                    {targetSummary.names.length > 0 && <div className="col-span-2 text-xs text-ink-2">{targetSummary.names.join(' · ')}</div>}
                    {targetSummary.resources.length > 0 && (
                      <div className="col-span-2 flex flex-wrap gap-1">
                        {targetSummary.resources.map((r) => (
                          <Badge key={r}>{label(r)}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="col-span-2 flex flex-wrap gap-1">
                      {targetSummary.estimated && <Badge>Passive estimate</Badge>}
                      {targetSummary.danger && <Badge tone="bad">Hazard detected</Badge>}
                      {targetSummary.risk && !targetSummary.danger && !/^(low|none|minimal)$/i.test(targetSummary.risk) && <Badge tone="warn">Risk: {label(targetSummary.risk)}</Badge>}
                      {!!targetSummary.inhabited && <Badge tone="ok">{targetSummary.inhabited} inhabited</Badge>}
                      {targetSummary.scut && <Badge tone="info">SCUT coverage</Badge>}
                      {targetSummary.refuel && <Badge tone="ok">Refuel station</Badge>}
                      {!!targetSummary.mineable && <Badge tone="accent">{targetSummary.mineable} mineable</Badge>}
                    </div>
                  </div>
                ) : (
                  <Button size="sm" className="w-full" icon={<Radar className="h-3.5 w-3.5" />} onClick={() => startScan(game, probeId, target, [target])}>
                    Observe this sector
                  </Button>
                )}
                {targetSummary?.estimated && (
                  <Button size="sm" variant="ghost" className="w-full" icon={<Radar className="h-3.5 w-3.5" />} onClick={() => startScan(game, probeId, target, [target])}>
                    Observe again
                  </Button>
                )}
                {targetBookmark ? (
                  <div className="flex items-center gap-2 rounded-lg border border-warn/20 bg-warn/[0.05] px-3 py-2 text-xs">
                    <Star className="h-3.5 w-3.5 fill-warn text-warn" />
                    <span className="flex-1">{targetBookmark.name}</span>
                    <button onClick={() => archive.unbookmark(target)} className="text-ink-3 hover:text-bad" aria-label="Remove bookmark">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input placeholder="Bookmark name" value={bookmarkName} onChange={(e) => setBookmarkName(e.target.value)} />
                    <Button
                      icon={<Star className="h-3.5 w-3.5" />}
                      disabled={!bookmarkName.trim()}
                      onClick={() => {
                        archive.bookmark(target, bookmarkName.trim());
                        setBookmarkName('');
                      }}
                    >
                      Save
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Bookmarks" subtitle={`${Object.keys(archive.bookmarks).length} saved locally`} icon={<Star />} />
            <div className="divide-y divide-line">
              {Object.values(archive.bookmarks).map((b) => (
                <button key={coordKey(b.coord)} onClick={() => pick(b.coord)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-raised">
                  <Star className="h-3.5 w-3.5 fill-warn text-warn" />
                  <span className="flex-1 truncate">{b.name}</span>
                  <span className="num text-xs text-ink-3">{formatCoord(b.coord)}</span>
                </button>
              ))}
              {!Object.keys(archive.bookmarks).length && <div className="px-5 py-4 text-xs text-ink-3">Click a sector on the map to bookmark it.</div>}
            </div>
          </Card>
        </div>
      </div>

      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title={mode === 'voyage' ? 'Start managed voyage?' : jumps > 1 ? `Fly ${jumps} jumps?` : 'Engage jump drive?'}
        confirmLabel={mode === 'voyage' ? 'Start voyage' : 'Engage'}
        body={
          <>
            <p>
              {p?.name} will jump from <span className="num text-ink">{formatCoord(here)}</span> to <span className="num text-ink">{formatCoord(dest ?? undefined)}</span> ({distance} hops
              {jumps > 1 ? `, as ${jumps} jumps of up to ${maxHop} sector${maxHop === 1 ? '' : 's'}` : ''}).
            </p>
            <p className="text-xs text-ink-3">Deuterium is consumed by the game. Movement can only be cancelled during preparation.</p>
          </>
        }
        onConfirm={engage}
      />
      {inspect && <InspectDialog object={inspect} probeId={probeId} onClose={() => setInspect(null)} />}
    </Page>
  );
}

function MiniStat({ label: l, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-chrome px-2 py-2">
      <div className="text-[11.5px] text-ink-3">{l}</div>
      <div className="num mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function SectorReadout({ sector: s, onInspect }: { sector: Sector; onInspect: (o: SectorObject) => void }) {
  const mineable = new Set(miningTargets(s).map((t) => t.id));
  const relays = scutRelays(s);
  const station = hasRefuelStation(s);
  const extra = Object.fromEntries(Object.entries(s.raw).filter(([k]) => !['objects', 'probes', 'relativeCoordinates', 'knowledgeLevel', 'dataFreshness', 'scutCoverageStatus', 'scutNetworks', 'navigationalRisk'].includes(k)));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3">
        {s.knowledgeLevel && <Badge tone="accent">{label(s.knowledgeLevel)} scan</Badge>}
        {s.dataFreshness && <Badge tone={/live/.test(s.dataFreshness) ? 'ok' : 'warn'}>Data {label(s.dataFreshness)}</Badge>}
        <Badge tone={s.scutCoverage === 'covered' ? 'ok' : 'neutral'}>SCUT {label(s.scutCoverage ?? 'unknown')}</Badge>
        {s.scutNetworks.map((n) => (
          <Badge key={n.id} tone="info">
            {n.name}
          </Badge>
        ))}
        {s.navigationalRisk && <Badge tone={/high|extreme/i.test(s.navigationalRisk) ? 'bad' : /medium|moderate/i.test(s.navigationalRisk) ? 'warn' : 'neutral'}>Risk: {label(s.navigationalRisk)}</Badge>}
        <Badge tone={mineable.size ? 'ok' : 'neutral'}>{mineable.size} mineable</Badge>
        {relays.length > 0 && <Badge tone="info">{relays.length} SCUT relay{relays.length === 1 ? '' : 's'}</Badge>}
        {station && <Badge tone="ok">Refuel station</Badge>}
      </div>
      <div className="divide-y divide-line">
        {s.objects.map((o) => (
          <ObjectRow key={o.id} object={o} depth={0} mineable={mineable} onInspect={onInspect} />
        ))}
        {!s.objects.length && <Empty icon={<Radar />} title="Nothing detected" />}
        {s.probes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs text-ink-3">
            Probes here:
            {s.probes.map((x) => (
              <Badge key={x.id} tone="info">
                {x.name ?? `#${x.id}`}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {Object.keys(extra).length > 0 && (
        <details className="border-t border-line px-5 py-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-2">Other sensor data</summary>
          <div className="mt-3">
            <Fields value={extra} />
          </div>
        </details>
      )}
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { mineable: 'mineable body', bookmark: 'waypoint target', planet: 'planet', moon: 'moon', star: 'star' };

function ObjectRow({ object: o, depth, mineable, onInspect }: { object: SectorObject; depth: number; mineable: Set<string>; onInspect: (o: SectorObject) => void }) {
  const [open, setOpen] = useState(depth === 0);
  const chips = factChips(o, 6);
  return (
    <>
      <div className={cn('flex items-start gap-3 px-5 py-2.5 hover:bg-raised', depth && 'bg-chrome')} style={{ paddingLeft: 20 + depth * 24 }}>
        <button onClick={() => setOpen(!open)} className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', objectTone(o.type))} aria-label="Toggle">
          <ObjectIcon type={o.type} />
        </button>
        <button onClick={() => onInspect(o)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium">{o.name}</div>
          <div className="truncate text-xs text-ink-3">
            {label(o.type)}
            {o.role && o.role !== 'object' && o.type !== o.role ? ` · ${ROLE_LABEL[o.role] ?? o.role}` : ''}
            {o.children.length ? ` · ${o.children.length} bodies` : ''}
            {o.resourceTypes?.length ? ` · ${o.resourceTypes.map((r) => `${label(r)}${o.resourceAmounts?.[r] !== undefined ? ` ${+o.resourceAmounts[r].toFixed(3)}` : ''}`).join(', ')}` : ''}
          </div>
          {typeof o.raw.summary === 'string' && <div className="mt-0.5 text-xs text-ink-2">{o.raw.summary}</div>}
          {chips.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {chips.map((c) => (
                <span key={c.key} className={cn('rounded-md border px-1.5 py-0.5 text-[11.5px]', c.tone === 'bad' ? 'border-bad/25 bg-bad/10 text-bad' : c.tone === 'ok' ? 'border-ok/25 bg-ok/10 text-ok' : 'border-line bg-chrome text-ink-3')}>
                  {c.text}
                </span>
              ))}
            </div>
          )}
        </button>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {mineable.has(o.id) && <Badge tone="accent">Mineable</Badge>}
          {(o.type === 'black_hole' || o.raw.dangerLevel === 'extreme') && <Badge tone="bad">Hazard</Badge>}
        </div>
      </div>
      {open && o.children.map((c) => <ObjectRow key={c.id} object={c} depth={depth + 1} mineable={mineable} onInspect={onInspect} />)}
    </>
  );
}

function InspectDialog({ object: o, probeId, onClose }: { object: SectorObject; probeId: string; onClose: () => void }) {
  const crew = useMannies(probeId);
  const sector = useSectorQuery(probeId);
  const [order, setOrder] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const ready = (crew.data ?? []).filter(mannyReady);
  const canMine = miningTargets(sector.data?.sector).some((t) => t.id === o.id);
  const actions = [
    canMine && ['mine', 'Mine…'],
    o.inspectable !== false && ['inspect-sector-object', 'Inspect'],
    o.salvageable === true && ['salvage', 'Salvage'],
    o.type === 'asteroid' && ['motorize-asteroid', 'Motorize'],
    o.type === 'asteroid' && o.raw.motorized === true && ['refuel-motorized-asteroid', 'Refuel motor'],
    o.type === 'asteroid' && ['sculpt-duck-asteroid', 'Sculpt a duck'],
    (o.type === 'detached_container' || o.type === 'detached_storage_container') && ['recover-storage-container', 'Recover container'],
    ['install-bookmark', 'Install waypoint'],
  ].filter(Boolean) as [string, string][];
  return (
    <>
      <Dialog
        open={!order}
        onOpenChange={(v) => !v && onClose()}
        wide
        icon={<ObjectIcon type={o.type} />}
        title={o.name}
        description={`${label(o.type)} · ${o.id}`}
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="mr-auto text-xs text-ink-3">{ready.length} Mannies ready</span>
            {actions.map(([a, t]) => (
              <Button key={a} size="sm" variant={a === 'mine' ? 'primary' : 'secondary'} disabled={!ready.length} onClick={() => setOrder(a)}>
                {t}
              </Button>
            ))}
          </div>
        }
      >
        <div className="mb-3 flex justify-end">
          <Segmented value={raw ? 'raw' : 'readout'} onChange={(v) => setRaw(v === 'raw')} options={[{ value: 'readout', label: 'Readout' }, { value: 'raw', label: 'Raw JSON' }]} />
        </div>
        {raw ? <JsonView value={o.raw} className="max-h-[50vh]" /> : <Fields value={o.raw} skip={['id', 'name']} />}
      </Dialog>
      {order === 'mine' && <MiningDialog probeId={probeId} presetObjectId={o.id} onClose={() => (setOrder(null), onClose())} />}
      {order && order !== 'mine' && ready[0] && (
        <OrderDialogWithObject probeId={probeId} objectId={o.id} action={order} mannyId={ready[0].id} onClose={() => (setOrder(null), onClose())} />
      )}
    </>
  );
}

function OrderDialogWithObject({ probeId, objectId, action, onClose, mannyId }: { probeId: string; objectId: string; action: string; mannyId: string; onClose: () => void }) {
  const crew = useMannies(probeId);
  const m = crew.data?.find((x) => x.id === mannyId);
  if (!m) return null;
  return <OrderDialog open onOpenChange={(v) => !v && onClose()} probeId={probeId} mannies={[m]} initialAction={action} initialBody={{ objectId }} />;
}

