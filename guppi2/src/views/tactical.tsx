/**
 * Tactical: who else is in the sector, who is shooting at whom, and fire control.
 *
 * The game reports missiles in flight as `missile` objects in the sector reading
 * (`targetsCurrentProbe` marks the ones aimed at us). A missile is fired by an
 * embarked Manny with `ignite_missile`: one minute of preparation, then flight.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Crosshair, Radar, RefreshCw, Rocket, ShieldAlert, Target, X } from 'lucide-react';
import { useGame } from '@/state/session';
import { keys, useAction, useAlerts, useFleet, useMannies, useNow, useProbe, useSector, useSelectedProbeId } from '@/state/hooks';
import { useLaunches } from '@/state/tactical';
import { allBodies, contacts, isMoving, label, mannyReady, missiles, type Contact, type Missile } from '@/core/models';
import { formatCoord } from '@/core/lattice';
import { fmtDuration, fmtRelative } from '@/core/format';
import { GameApiError } from '@/core/errors';
import { Badge, Button, Card, CardBody, CardHeader, Empty, ErrorNote, Field, Select, Skeleton, cn } from '@/components/ui/primitives';
import { Confirm } from '@/components/ui/dialog';
import { Page, PageHeader } from '@/components/shared';

const KIND: Record<Contact['kind'], { text: string; tone: 'accent' | 'warn' | 'bad' | 'neutral' }> = {
  own: { text: 'Yours', tone: 'accent' },
  probe: { text: 'Other player', tone: 'warn' },
  others: { text: 'Others', tone: 'bad' },
  unknown: { text: 'Unknown', tone: 'neutral' },
};

/** Seconds to impact from whichever field the game gave us. */
const eta = (m: Missile, now: number) => m.secondsRemaining ?? (m.impactAt ? Math.max(0, (Date.parse(m.impactAt) - now) / 1000) : undefined);

export default function Tactical() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const probe = useProbe(probeId);
  const fleet = useFleet();
  const crew = useMannies(probeId);
  const alerts = useAlerts(probeId);
  const now = useNow(1000);
  const [targetId, setTargetId] = useState('');
  const [mannyId, setMannyId] = useState('');
  const [missileItemId, setMissileItemId] = useState('');
  const [confirm, setConfirm] = useState(false);

  // Read the sector often while we are watching it, faster still under fire.
  const [underFire, setUnderFire] = useState(false);
  const sector = useSector(probeId, underFire ? 5_000 : 10_000);
  const s = sector.data?.sector;
  const p = probe.data;
  const moving = isMoving(p);

  const ownIds = useMemo(() => fleet.probes.map((x) => x.id), [fleet.probes]);
  const ships = useMemo(() => contacts(s, probeId, ownIds), [s, probeId, ownIds]);
  const flying = useMemo(() => missiles(s, probeId), [s, probeId]);
  const inbound = flying.filter((m) => m.targetsCurrentProbe);
  useEffect(() => setUnderFire(inbound.length > 0), [inbound.length]);
  const nearest = inbound.map((m) => eta(m, now)).filter((n): n is number => n !== undefined).sort((a, b) => a - b)[0];

  const bodies = useMemo(() => allBodies(s).filter((o) => !/missile/i.test(o.type)), [s]);
  const target = ships.find((c) => c.id === targetId) ?? (bodies.find((o) => o.id === targetId) ? { id: targetId, name: bodies.find((o) => o.id === targetId)!.name, kind: 'unknown' as const } : undefined);
  const ready = (crew.data ?? []).filter(mannyReady);
  const manny = ready.find((m) => m.id === mannyId) ?? ready[0];
  const aboard = (p?.inventory?.items ?? []).filter((i) => /missile/i.test(`${i.type} ${i.name ?? ''}`) && !i.currentTask);
  const nameOf = (id?: string) => (id === probeId ? 'you' : (ships.find((c) => c.id === id)?.name ?? flying.find((m) => m.id === id)?.targetName ?? bodies.find((o) => o.id === id)?.name ?? id ?? '—'));

  const allLaunches = useLaunches((x) => x.launches);
  const launches = useMemo(() => allLaunches.filter((l) => l.probeId === probeId), [allLaunches, probeId]);
  const addLaunch = useLaunches((x) => x.add);
  const removeLaunch = useLaunches((x) => x.remove);
  const tracked = useQueries({
    queries: launches.map((l) => ({
      queryKey: ['missile', probeId, l.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => game.missile(probeId, l.id, { signal }),
      refetchInterval: 10_000,
      retry: false,
    })),
  });

  const fire = useAction(
    (v: { mannyId: string; targetId: string; missileItemId?: string }) => game.igniteMissile(probeId, v.mannyId, { targetId: v.targetId, ...(v.missileItemId ? { missileItemId: v.missileItemId } : {}) }),
    (v) => ({
      label: `Preparing a missile for ${nameOf(v.targetId)}…`,
      success: 'Missile preparation started. Launch in about one minute.',
      invalidate: [keys.mannies(probeId), keys.sector(probeId), keys.probe(probeId), keys.alerts(probeId)],
      claim: { operation: 'POST /api/probe/{probeId}/mannies/{mannyId}/ignite_missile', probeId, params: { mannyId: v.mannyId } },
    }),
  );
  const launch = () => {
    if (!manny || !target) return;
    fire.mutate(
      { mannyId: manny.id, targetId: target.id, missileItemId: missileItemId || undefined },
      {
        onSuccess: (r) => {
          const rec = (r as { missile?: { id?: unknown } } | null)?.missile;
          const id = rec?.id !== undefined ? String(rec.id) : undefined;
          if (id) addLaunch({ probeId, id, targetName: target.name, at: Date.now() });
        },
      },
    );
  };

  const combat = (alerts.data ?? []).filter((a) => /missile|destroy|attack|impact|hostile|weapon|fire/i.test(`${a.title} ${a.message ?? ''} ${a.raw.type ?? ''}`)).slice(0, 8);
  const canFire = !!target && !!manny && aboard.length > 0 && !moving && !sector.isError;

  return (
    <Page>
      <PageHeader
        title="Tactical"
        subtitle={p?.sector ? `${p.name} at ${formatCoord(p.sector)} · ${ships.length} other ${ships.length === 1 ? 'ship' : 'ships'} · ${flying.length} ${flying.length === 1 ? 'missile' : 'missiles'} in flight` : 'Loading position…'}
        actions={
          <>
            {inbound.length > 0 && (
              <Badge tone="bad" dot>
                Under fire · {inbound.length} inbound{nearest !== undefined ? ` · ${fmtDuration(nearest)}` : ''}
              </Badge>
            )}
            <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={sector.isFetching} onClick={() => sector.refetch()}>
              Refresh
            </Button>
          </>
        }
      />
      {sector.error &&
        (sector.error instanceof GameApiError && sector.error.code === 'sensors_unavailable' ? (
          <Empty icon={<Radar />} title="Sensors unavailable while moving">
            Contacts and missiles come back when the probe slows down.
          </Empty>
        ) : (
          <ErrorNote error={sector.error} onRetry={() => sector.refetch()} />
        ))}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Contacts" subtitle="Every other ship the sensors report in this sector" icon={<Radar />} />
            {sector.isLoading && <div className="space-y-2 p-5">{[0, 1].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
            {s && ships.length === 0 && (
              <Empty icon={<Radar />} title="No other ships detected">
                Only {p?.name} is here. Other players' probes and Others craft appear as they arrive.
              </Empty>
            )}
            {ships.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] font-medium text-ink-3">
                    {['Ship', 'Status', 'Firing at', 'Targeted by', ''].map((h) => (
                      <th key={h} className="px-5 py-2.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ships.map((c) => {
                    const fired = flying.filter((m) => m.launcherId === c.id);
                    const aimedAt = flying.filter((m) => m.targetId === c.id);
                    const atYou = fired.some((m) => m.targetsCurrentProbe);
                    const selected = c.id === targetId;
                    return (
                      <tr key={c.id} className={cn('hover:bg-raised', selected && 'bg-raised')}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 font-medium">
                            {c.name}
                            <Badge tone={KIND[c.kind].tone}>{KIND[c.kind].text}</Badge>
                            {c.hostile && c.kind !== 'own' && <Badge tone="bad">Hostile</Badge>}
                          </div>
                          <div className="text-xs text-ink-3">
                            {label(c.type)}
                            {c.integrity !== undefined ? ` · hull ${c.integrity}%` : ''} · <span className="mono">{c.id}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-ink-2">{c.status ? label(c.status) : '—'}</td>
                        <td className="px-5 py-3">
                          {fired.length ? (
                            <div className="flex flex-wrap gap-1">
                              {fired.map((m) => (
                                <Badge key={m.id} tone={m.targetsCurrentProbe ? 'bad' : 'warn'} dot>
                                  → {m.targetsCurrentProbe ? 'you' : nameOf(m.targetId)}
                                  {eta(m, now) !== undefined ? ` · ${fmtDuration(eta(m, now)!)}` : ''}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-ink-4">—</span>
                          )}
                        </td>
                        <td className="num px-5 py-3 text-ink-2">{aimedAt.length || <span className="text-ink-4">—</span>}</td>
                        <td className="px-5 py-3 text-right">
                          <Button size="xs" variant={selected ? 'primary' : atYou ? 'secondary' : 'ghost'} icon={<Crosshair className="h-3.5 w-3.5" />} onClick={() => setTargetId(selected ? '' : c.id)}>
                            {selected ? 'Targeted' : 'Target'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <CardHeader title="Missiles in flight" subtitle={flying.length ? `${inbound.length} aimed at ${p?.name ?? 'you'}` : 'Nothing in the air'} icon={<Rocket />} />
            {s && flying.length === 0 && <div className="px-5 py-4 text-xs text-ink-3">Missiles appear here from launch to impact, with who fired them and at whom.</div>}
            {flying.length > 0 && (
              <div className="divide-y divide-line">
                {flying
                  .slice()
                  .sort((a, b) => Number(b.targetsCurrentProbe) - Number(a.targetsCurrentProbe) || (eta(a, now) ?? 1e9) - (eta(b, now) ?? 1e9))
                  .map((m) => {
                    const t = eta(m, now);
                    return (
                      <div key={m.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm', m.targetsCurrentProbe && 'bg-bad/[0.06]')}>
                        <span className="font-medium">{nameOf(m.launcherId) === 'you' ? p?.name : (m.launcherName ?? nameOf(m.launcherId))}</span>
                        <span className="text-ink-3">→</span>
                        <span className={cn('font-medium', m.targetsCurrentProbe && 'text-bad')}>{m.targetsCurrentProbe ? `${p?.name} (you)` : (m.targetName ?? nameOf(m.targetId))}</span>
                        {m.targetsCurrentProbe && (
                          <Badge tone="bad" dot>
                            Inbound
                          </Badge>
                        )}
                        <span className="ml-auto num text-ink-2">{t !== undefined ? `Impact in ${fmtDuration(t)}` : m.status ? label(m.status) : ''}</span>
                        {m.launchedAt && <span className="text-xs text-ink-4">fired {fmtRelative(m.launchedAt, now)}</span>}
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Combat log" subtitle="Impacts, kills and destroyed-probe notices from the game's alerts" icon={<ShieldAlert />} />
            {combat.length === 0 && <div className="px-5 py-4 text-xs text-ink-3">No combat alerts yet.</div>}
            <div className="divide-y divide-line">
              {combat.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <Badge tone={/critical|danger|high/i.test(a.severity ?? '') ? 'bad' : /warn/i.test(a.severity ?? '') ? 'warn' : 'neutral'}>{a.severity ? label(a.severity) : 'Alert'}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{a.title}</div>
                    {a.message && <div className="text-xs text-ink-3">{a.message}</div>}
                  </div>
                  <span className="shrink-0 text-xs text-ink-4">{fmtRelative(a.createdAt, now)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Fire control" subtitle="A Manny prepares the missile for one minute, then it flies" icon={<Target />} />
            <CardBody className="space-y-4">
              <Field label="Target" hint={target ? undefined : 'Pick a ship in Contacts, or any object here.'}>
                <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                  <option value="">Choose a target…</option>
                  {ships.length > 0 && (
                    <optgroup label="Ships">
                      {ships.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {KIND[c.kind].text}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {bodies.filter((o) => !ships.some((c) => c.id === o.id)).length > 0 && (
                    <optgroup label="Other objects">
                      {bodies
                        .filter((o) => !ships.some((c) => c.id === o.id))
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} · {label(o.type)}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </Select>
              </Field>
              {target && 'kind' in target && target.kind === 'own' && <div className="rounded-lg border border-warn/25 bg-warn/[0.06] px-3 py-2 text-xs text-warn">That is one of your own probes.</div>}
              <Field label="Manny" hint={ready.length ? undefined : 'No Manny is free aboard.'}>
                <Select value={manny?.id ?? ''} onChange={(e) => setMannyId(e.target.value)} disabled={!ready.length}>
                  {ready.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Missile" hint={aboard.length ? `${aboard.length} aboard` : 'No missile aboard. Craft or salvage one first.'}>
                <Select value={missileItemId} onChange={(e) => setMissileItemId(e.target.value)} disabled={!aboard.length}>
                  <option value="">First available</option>
                  {aboard.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name ?? label(i.type)} · {i.id}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="primary" size="lg" className="w-full" icon={<Rocket className="h-4 w-4" />} disabled={!canFire} loading={fire.isPending} onClick={() => setConfirm(true)}>
                {target ? `Fire at ${target.name}` : 'Fire missile'}
              </Button>
              <p className="text-xs leading-relaxed text-ink-3">{moving ? 'Weapons are unavailable while the probe is moving.' : 'Preparation takes one minute and cannot be recalled once the missile is in flight.'}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Your launches" subtitle={launches.length ? `${launches.length} tracked this session` : 'Missiles you fire are followed here'} icon={<Crosshair />} />
            {launches.length === 0 && <div className="px-5 py-4 text-xs text-ink-3">Nothing fired yet.</div>}
            <div className="divide-y divide-line">
              {launches.map((l, i) => {
                const m = tracked[i]?.data;
                const t = m ? eta(m, now) : undefined;
                const status = m?.status ?? (tracked[i]?.error ? 'unknown' : 'preparing');
                return (
                  <div key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">→ {l.targetName}</div>
                      <div className="text-xs text-ink-3">
                        <span className="mono">{l.id}</span> · fired {fmtRelative(l.at, now)}
                      </div>
                    </div>
                    <Badge tone={/hit|destroy/i.test(status) ? 'ok' : /miss|fail|intercept|lost/i.test(status) ? 'bad' : /flight|flying|launched/i.test(status) ? 'info' : 'neutral'}>
                      {label(status)}
                      {t !== undefined && t > 0 ? ` · ${fmtDuration(t)}` : ''}
                    </Badge>
                    <button onClick={() => removeLaunch(l.id)} className="text-ink-4 hover:text-ink" aria-label="Stop tracking">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        danger
        title={`Fire a missile at ${target?.name ?? 'the target'}?`}
        confirmLabel="Fire"
        body={
          <>
            <p>
              {manny?.name} will spend one minute preparing a missile aimed at <span className="text-ink">{target?.name}</span>
              {target && 'kind' in target && target.kind !== 'unknown' ? ` (${KIND[target.kind].text.toLowerCase()})` : ''}. Once it flies there is no recall.
            </p>
            <p className="text-xs text-ink-3">{aboard.length} missile{aboard.length === 1 ? '' : 's'} aboard. The game decides the outcome.</p>
          </>
        }
        onConfirm={launch}
      />
    </Page>
  );
}
