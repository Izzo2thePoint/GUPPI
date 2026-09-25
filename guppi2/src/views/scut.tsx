import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Antenna, Bot, Cpu, Network, Power, RadioTower, RefreshCw, Satellite } from 'lucide-react';
import { useGame } from '@/state/session';
import { keys, useAction, useMannies, useProbe, useSector, useSelectedProbeId } from '@/state/hooks';
import { label, mannyReady, scutRelays } from '@/core/models';
import { formatCoord, sameCoord } from '@/core/lattice';
import { fmtNumber } from '@/core/format';
import { GameApiError } from '@/core/errors';
import { Badge, Button, Card, CardBody, CardHeader, Empty, ErrorNote, Field, Input, Select, Skeleton } from '@/components/ui/primitives';
import { Page, PageHeader } from '@/components/shared';

type NetworkRelay = { id?: unknown; name?: string; status?: string; isTransitBeacon?: boolean; coverageRadiusSectors?: number; sector?: { relative?: { x: number; y: number; z: number } } };
type NetworkDetail = { id?: unknown; name?: string; relayCount?: number; coveredSectorCount?: number; relays?: NetworkRelay[]; probes?: { id?: unknown; name?: string }[] };

export default function Scut() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const probe = useProbe(probeId);
  const sector = useSector(probeId);
  const crew = useMannies(probeId);
  const s = sector.data?.sector;
  const [networkId, setNetworkId] = useState('');
  const activeNetwork = networkId || s?.scutNetworks[0]?.id || '';
  const network = useQuery({
    queryKey: ['scut-network', probeId, activeNetwork],
    queryFn: async ({ signal }) => ((await game.scutNetwork(probeId, activeNetwork, { signal })) as { network?: NetworkDetail })?.network ?? null,
    enabled: !!activeNetwork,
    staleTime: 60_000,
  });
  const relays = scutRelays(s);
  const ready = (crew.data ?? []).filter(mannyReady);
  const [mannyId, setMannyId] = useState('');
  const [networkName, setNetworkName] = useState('');
  const manny = ready.find((m) => m.id === mannyId) ?? ready[0];
  const count = (type: string) => probe.data?.inventory?.items.filter((i) => i.type === type).length ?? 0;
  const circuits = count('integrated_circuit');
  const beacons = count('scut_transit_beacon');
  const hasStar = s?.objects.some((o) => o.type === 'solar_system' || o.type === 'star') ?? false;
  const remote = (crew.data ?? []).filter((m) => m.locationType === 'sector' && !sameCoord(m.locationSector, probe.data?.sector));

  const order = useAction(
    (v: { relayId: string; beacon: boolean }) =>
      game.mannyAction(probeId, manny!.id, v.beacon ? 'install-scut-transit-beacon' : 'turn-on-relay', {
        relayId: Number(v.relayId),
        ...(!v.beacon && networkName.trim() ? { networkName: networkName.trim() } : {}),
      }),
    (v) => ({
      label: v.beacon ? 'Installing SCUT transit beacon…' : 'Turning on SCUT relay…',
      success: v.beacon ? 'Beacon installation started (about five minutes)' : 'Relay activation started (about five minutes)',
      invalidate: [keys.mannies(probeId), keys.sector(probeId), keys.probe(probeId), ['scut-network', probeId]],
      claim: { operation: `POST /api/probe/{probeId}/mannies/{mannyId}/${v.beacon ? 'install-scut-transit-beacon' : 'turn-on-relay'}`, probeId, params: { mannyId: manny?.id } },
    }),
  );

  const covered = s?.scutCoverage === 'covered';

  return (
    <Page>
      <PageHeader
        title="SCUT network"
        subtitle="Subspace comms coverage lets you command probes and Mannies across sectors — including remote mining outposts."
        actions={
          <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={sector.isFetching || network.isFetching} onClick={() => (sector.refetch(), network.refetch())}>
            Refresh
          </Button>
        }
      />
      {sector.error && (sector.error instanceof GameApiError && sector.error.code === 'sensors_unavailable' ? <Empty icon={<Satellite />} title="Sensors unavailable while moving">{sector.error.message}</Empty> : <ErrorNote error={sector.error} onRetry={() => sector.refetch()} />)}

      <div className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
        <div className="space-y-5">
          <Card className="relative overflow-hidden">
            <div className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full ${covered ? 'bg-[radial-gradient(closest-side,rgb(52_211_153/0.25),transparent)]' : 'bg-[radial-gradient(closest-side,rgb(148_163_184/0.12),transparent)]'}`} />
            <CardBody className="relative">
              <div className="flex items-center gap-4">
                <div className={`grid h-14 w-14 place-items-center rounded-2xl ${covered ? 'bg-ok/15 text-ok' : 'bg-white/5 text-ink-3'}`}>
                  <RadioTower className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-ink-3">Current sector · {formatCoord(s?.coord ?? probe.data?.sector)}</div>
                  <div className="text-2xl font-semibold tracking-tight">{sector.isLoading ? '…' : covered ? 'Covered by SCUT' : label(s?.scutCoverage ?? 'No coverage reported')}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {s?.scutNetworks.map((n) => (
                  <button key={n.id} onClick={() => setNetworkId(n.id)}>
                    <Badge tone={n.id === activeNetwork ? 'accent' : 'info'}>
                      <Network className="h-3 w-3" /> {n.name}
                    </Badge>
                  </button>
                ))}
                {s && !s.scutNetworks.length && <span className="text-sm text-ink-3">No active network reaches this sector.</span>}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-ink-3">
                Probes and Mannies in sectors covered by the same network can receive orders remotely. That is how outposts keep mining after you leave.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Relays in this sector" subtitle={`${relays.length} detected · ${circuits} integrated circuit${circuits === 1 ? '' : 's'} · ${beacons} transit beacon${beacons === 1 ? '' : 's'} aboard`} icon={<Antenna />} />
            {relays.length ? (
              <>
                <CardBody className="grid gap-3 border-b border-line sm:grid-cols-2">
                  <Field label="Manny">
                    <Select value={manny?.id ?? ''} onChange={(e) => setMannyId(e.target.value)} disabled={!ready.length}>
                      {!ready.length && <option>No Manny ready aboard</option>}
                      {ready.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Name for a new network (optional)" hint="Ignored if the relay joins existing coverage.">
                    <Input value={networkName} maxLength={80} onChange={(e) => setNetworkName(e.target.value)} />
                  </Field>
                </CardBody>
                <div className="divide-y divide-line">
                  {relays.map((r) => {
                    const active = /active|on/i.test(String(r.raw.status ?? '')) && !/inactive/i.test(String(r.raw.status ?? ''));
                    return (
                      <div key={r.id} className="flex items-start gap-3 px-5 py-3.5">
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-ok/10 text-ok' : 'bg-white/5 text-ink-3'}`}>
                          <RadioTower className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{r.name}</span>
                            <Badge tone={active ? 'ok' : 'neutral'}>{label(String(r.raw.status ?? 'unknown'))}</Badge>
                            {r.raw.isTransitBeacon === true && <Badge tone="accent">Transit beacon</Badge>}
                          </div>
                          {typeof r.raw.summary === 'string' && <div className="mt-0.5 text-xs text-ink-3">{r.raw.summary}</div>}
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          {!active && (
                            <Button size="xs" variant="primary" icon={<Power className="h-3.5 w-3.5" />} disabled={!manny || order.isPending} onClick={() => order.mutate({ relayId: r.id, beacon: false })}>
                              Turn on
                            </Button>
                          )}
                          {active && r.raw.isTransitBeacon !== true && (
                            <Button size="xs" icon={<Cpu className="h-3.5 w-3.5" />} disabled={!manny || order.isPending} onClick={() => order.mutate({ relayId: r.id, beacon: true })}>
                              Install beacon
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-5 py-3 text-xs leading-relaxed text-ink-3">
                  Turning on a relay needs a local star {hasStar ? '(present ✓)' : '(none detected here)'} and one integrated circuit. A transit beacon needs an active relay and one stored SCUT transit beacon.
                </div>
              </>
            ) : (
              <Empty icon={<Antenna />} title="No SCUT relays here">Relays found while exploring show up here so you can switch them on.</Empty>
            )}
          </Card>

          <Card>
            <CardHeader title="Remote crew" subtitle="Mannies working in other sectors" icon={<Bot />} />
            <div className="divide-y divide-line">
              {remote.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="flex-1 font-medium">{m.name}</span>
                  <span className="num text-xs text-ink-3">{formatCoord(m.locationSector)}</span>
                  <Badge tone={m.currentTask === 'unknown_too_far' ? 'warn' : m.currentTask ? 'accent' : 'ok'}>
                    {m.currentTask === 'unknown_too_far' ? 'Out of SCUT contact' : m.currentTask ? label(m.currentTask) : 'Idle, reachable'}
                  </Badge>
                </div>
              ))}
              {!remote.length && <div className="px-5 py-4 text-xs text-ink-3">No Mannies are stationed in other sectors.</div>}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader
            title={network.data?.name ?? 'Network details'}
            subtitle={network.data ? `${fmtNumber(network.data.relayCount, 0)} relays · ${fmtNumber(network.data.coveredSectorCount, 0)} covered sectors` : 'Choose a network'}
            icon={<Network />}
            actions={
              s && s.scutNetworks.length > 1 ? (
                <Select value={activeNetwork} onChange={(e) => setNetworkId(e.target.value)} className="h-8 w-44 text-xs">
                  {s.scutNetworks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </Select>
              ) : undefined
            }
          />
          {!activeNetwork && <Empty icon={<Network />} title="No network to inspect">Move into SCUT coverage, or switch on a relay, to see network details.</Empty>}
          {network.isLoading && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
          {network.error && <CardBody><ErrorNote error={network.error} onRetry={() => network.refetch()} /></CardBody>}
          {network.data && (
            <>
              <div className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Relays</div>
              <div className="divide-y divide-line">
                {(network.data.relays ?? []).map((r, i) => (
                  <div key={String(r.id ?? i)} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <RadioTower className="h-4 w-4 text-ink-3" />
                    <span className="flex-1">{r.name ?? `Relay ${String(r.id)}`}</span>
                    <span className="num text-xs text-ink-3">{formatCoord(r.sector?.relative)}</span>
                    {r.coverageRadiusSectors !== undefined && <span className="text-xs text-ink-3">radius {r.coverageRadiusSectors}</span>}
                    <Badge tone={r.status === 'active' ? 'ok' : 'neutral'}>{label(r.status ?? 'unknown')}</Badge>
                    {r.isTransitBeacon && <Badge tone="accent">Beacon</Badge>}
                  </div>
                ))}
                {!network.data.relays?.length && <div className="px-5 py-3 text-xs text-ink-3">No relays reported.</div>}
              </div>
              <div className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Probes in network</div>
              <div className="flex flex-wrap gap-1.5 px-5 py-3">
                {(network.data.probes ?? []).map((p, i) => <Badge key={String(p.id ?? i)} tone="info">{p.name ?? `#${String(p.id)}`}</Badge>)}
                {!network.data.probes?.length && <span className="text-xs text-ink-3">None reported.</span>}
              </div>
            </>
          )}
        </Card>
      </div>
    </Page>
  );
}
