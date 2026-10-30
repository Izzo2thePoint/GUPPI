#!/usr/bin/env node
// guppi: command line for GUPPI's Agent API. Pair once, then read the fleet and
// give orders from scripts or an AI agent's shell. `--json` prints raw API
// responses; without it, compact tables for people.
import { ApiError, VERBS, VERSION, call, configPath, loadConfig, parsePairing, saveConfig, stream } from './lib.mjs';

const argv = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--') {
    args.push(...argv.slice(i + 1));
    break;
  }
  if (a.startsWith('--')) {
    const [k, inline] = a.slice(2).split('=', 2);
    if (inline !== undefined) flags[k] = inline;
    else if (['json', 'voyage', 'scan', 'follow', 'raw', 'unread', 'help', 'version', 'printer'].includes(k)) flags[k] = true;
    else flags[k] = argv[++i];
  } else args.push(a);
}
const json = !!flags.json;
const cfg = { ...loadConfig(), ...(flags.url ? { url: flags.url } : {}), ...(flags.token ? { token: flags.token } : {}), ...(flags.client ? { client: flags.client } : {}) };

const out = (v) => process.stdout.write((typeof v === 'string' ? v : JSON.stringify(v, null, 2)) + '\n');
const die = (msg, code = 1) => {
  process.stderr.write(`guppi: ${msg}\n`);
  process.exit(code);
};
const coord = (c) => (c ? `${c.x}, ${c.y}, ${c.z}` : '—');
const table = (rows, cols) => {
  if (!rows.length) return '(none)';
  const w = cols.map((c) => Math.max(c.label.length, ...rows.map((r) => String(c.get(r) ?? '').length)));
  const line = (vals) => vals.map((v, i) => String(v ?? '').padEnd(w[i])).join('  ').trimEnd();
  return [line(cols.map((c) => c.label)), line(w.map((n) => '─'.repeat(n))), ...rows.map((r) => line(cols.map((c) => c.get(r))))].join('\n');
};
const col = (label, get) => ({ label, get });
const ago = (t) => {
  const s = Math.max(0, Math.round((Date.now() - (typeof t === 'number' ? t : Date.parse(t))) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};
const eta = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

async function probeId() {
  if (flags.probe) return String(flags.probe);
  const st = await call(cfg, 'GET', '/api/v1/status');
  if (!st.selectedProbeId) die('No probe selected in GUPPI. Pass --probe <id>.');
  return String(st.selectedProbeId);
}
const parseCoord = (xs) => {
  const [x, y, z] = xs.map(Number);
  if (![x, y, z].every(Number.isInteger)) die('Give a sector as three whole numbers: X Y Z');
  return { x, y, z };
};
const act = (name, body) => call(cfg, 'POST', `/api/v1/actions/${name}`, { body });
const show = (v, human) => out(json ? v : human());

const HELP = `guppi ${VERSION}: drive GUPPI (Neumann Probe mission control) from the shell.

Pairing
  guppi pair <pairing-link|token> [--url http://pc:47811]   Save the token from GUPPI → Settings → Phone & agent access
  guppi status                                             Connection, selected probe, jobs, rate budget

Reading (add --probe <id> to address a probe other than the one in command)
  guppi state           Everything at once: probes, the probe, crew, sector, jobs, outposts, alerts
  guppi probes          The fleet
  guppi probe [id]      One probe with crew and inventory
  guppi sector          Bodies, mineable targets, contacts and missiles where the probe is
  guppi crew            Mannies and tasks
  guppi alerts [--unread]
  guppi archive         Observed sectors and bookmarks (the star map's data)
  guppi jobs | guppi job <id> | guppi outposts | guppi recipes
  guppi events [--since N] [--follow]   What happened; --follow streams live
  guppi openapi         The API as OpenAPI 3.1

Acting (needs Control scope in GUPPI)
  guppi jump X Y Z [--voyage] [--scan] [--reserve N]   One sector per jump by default; further trips become voyages
  guppi scan                                          Observe the 12 neighbouring sectors
  guppi mine <objectId> --amount 0.2 [--resources metals,ice] [--mannies a,b] [--container id]
  guppi craft <recipe> [--count N] [--mannies a,b]
  guppi order <mannyId> <action> [--body '{"objectId":"..."}']
  guppi recall <mannyId>
  guppi fire <targetId> [--manny id] [--missile id]    Dangerous: needs "Allow dangerous actions"
  guppi stop <jobId> | guppi outpost pause|resume <id> | guppi select <probeId>
  guppi bookmark X Y Z <name> [--note text]
  guppi game <METHOD> <path> [--body json]             Any documented game endpoint through GUPPI

Global flags: --json (raw output) --probe <id> --url <url> --token <token> --client <name>
Environment: GUPPI_URL, GUPPI_TOKEN, GUPPI_CLIENT. Config: ${configPath()}
Docs: https://github.com/Izzo2thePoint/GUPPI/blob/main/docs/AGENT-API.md`;

async function main() {
  const [cmd, ...rest] = args;
  if (flags.version) return out(VERSION);
  if (!cmd || flags.help || cmd === 'help') return out(HELP);

  switch (cmd) {
    case 'pair': {
      const p = parsePairing(rest[0], flags.url);
      const next = { url: p.url, token: p.token, client: cfg.client };
      const probe = await call({ ...next }, 'GET', '/api/v1/status').catch((e) => e);
      if (probe instanceof ApiError && probe.status === 401) die('GUPPI rejected that token. Copy the pairing link again from Settings → Phone & agent access.');
      if (probe instanceof Error && !(probe instanceof ApiError)) die(probe.message);
      const file = saveConfig(next);
      return out(json ? { ok: true, url: p.url, config: file, status: probe instanceof Error ? undefined : probe } : `Paired with ${p.url}\nSaved to ${file}${probe instanceof ApiError ? `\n${probe.message}` : ''}`);
    }
    case 'status': {
      const s = await call(cfg, 'GET', '/api/v1/status');
      return show(s, () => [`GUPPI ${s.version} · ${s.connected ? `connected (${s.mode})` : 'not connected to the game'} · agents: ${s.scope}${s.dangerousAllowed ? ' + dangerous' : ''}`, `Selected probe: ${s.selectedProbeId ?? '—'}`, `Jobs: ${s.jobs.filter((j) => j.state === 'running' || j.state === 'waiting').length} running · Outposts: ${s.outposts.filter((o) => o.active).length} active`, s.link ? `Link: ${s.link.state} · ${s.link.queued} queued · budget ${s.link.remaining ?? '?'}` : ''].filter(Boolean).join('\n'));
    }
    case 'state': {
      const s = await call(cfg, 'GET', '/api/v1/state', { query: { probe: flags.probe, raw: flags.raw ? 1 : undefined } });
      return show(s, () => {
        const p = s.probe;
        const lines = [
          `${p.name} (#${p.id}) · ${p.status} · sector ${coord(p.sector)} · hull ${p.integrity ?? '?'}% · deuterium ${p.deuterium ?? '?'}%`,
          `Crew: ${s.crew.map((m) => `${m.name}${m.currentTask ? ` (${m.currentTask})` : ''}`).join(', ') || '—'}`,
        ];
        if (s.sector) {
          const sec = s.sector;
          lines.push(`Sector: ${sec.summary?.names?.join(', ') || 'no named system'} · ${sec.bodies.length} bodies · ${sec.mineable.length} mineable · SCUT ${sec.scutCoverage ?? '?'} · risk ${sec.navigationalRisk ?? '?'}${sec.refuelStation ? ' · refuel station' : ''}`);
          if (sec.contacts.length) lines.push(`Contacts: ${sec.contacts.map((c) => `${c.name} [${c.kind}${c.hostile ? ', hostile' : ''}]`).join(', ')}`);
          if (sec.missiles.length) lines.push(`Missiles: ${sec.missiles.map((m) => `${m.launcherName ?? m.launcherId} → ${m.targetsCurrentProbe ? 'YOU' : (m.targetName ?? m.targetId)}${m.impactAt ? ` in ${eta(m.impactAt)}` : ''}`).join('; ')}`);
        } else if (s.sectorError) lines.push(`Sector: ${s.sectorError.message}`);
        lines.push(`Fleet: ${s.probes.map((q) => `${q.name} @ ${coord(q.sector)} (${q.status})`).join(' · ')}`);
        const running = s.jobs.filter((j) => j.state === 'running' || j.state === 'waiting');
        lines.push(`Jobs: ${running.map((j) => `${j.name}: ${j.message}`).join(' · ') || 'none running'}`);
        if (s.alerts.length) lines.push(`Unread alerts: ${s.alerts.map((a) => a.title).join(' · ')}`);
        return lines.join('\n');
      });
    }
    case 'probes': {
      const list = await call(cfg, 'GET', '/api/v1/probes', { query: { raw: flags.raw ? 1 : undefined } });
      return show(list, () => table(list, [col('id', (p) => p.id), col('name', (p) => p.name), col('status', (p) => p.status), col('sector', (p) => coord(p.sector)), col('hull', (p) => (p.integrity ?? '') && `${p.integrity}%`), col('deut', (p) => (p.deuterium ?? '') && `${p.deuterium}%`), col('moving to', (p) => (p.movement?.target ? coord(p.movement.target) : ''))]));
    }
    case 'probe': {
      const id = rest[0] ?? (await probeId());
      const p = await call(cfg, 'GET', `/api/v1/probes/${encodeURIComponent(id)}`, { query: { raw: flags.raw ? 1 : undefined } });
      return show(p, () => [`${p.name} (#${p.id}) · ${p.status} · ${coord(p.sector)} · hull ${p.integrity ?? '?'}% · deuterium ${p.deuterium ?? '?'}/${p.deuteriumCapacity ?? '?'}`, p.inventory ? `Cargo ${p.inventory.usedCapacity} / ${p.inventory.capacity} ECE · ${p.inventory.items.length} items · ${p.inventory.containers.map((c) => c.label).join(', ')}` : '', table(p.crew, [col('manny', (m) => m.id), col('name', (m) => m.name), col('task', (m) => m.currentTask ?? 'ready'), col('where', (m) => (m.locationType === 'sector' ? coord(m.locationSector) : 'aboard'))])].filter(Boolean).join('\n'));
    }
    case 'sector': {
      const id = await probeId();
      const s = await call(cfg, 'GET', `/api/v1/probes/${encodeURIComponent(id)}/sector`, { query: { raw: flags.raw ? 1 : undefined } });
      return show(s, () => [`Sector ${coord(s.coord)} · ${s.knowledgeLevel ?? '?'} · SCUT ${s.scutCoverage ?? '?'} · risk ${s.navigationalRisk ?? '?'}${s.refuelStation ? ' · refuel station' : ''}`, table(s.bodies, [col('id', (b) => b.id), col('type', (b) => b.type), col('name', (b) => b.name), col('resources', (b) => (b.resourceTypes ?? []).map((r) => `${r}${b.resourceAmounts?.[r] !== undefined ? ` ${b.resourceAmounts[r]}` : ''}`).join(', ')), col('mine', (b) => (s.mineable.some((t) => t.id === b.id) ? 'yes' : ''))]), s.contacts.length ? '\nContacts\n' + table(s.contacts, [col('id', (c) => c.id), col('name', (c) => c.name), col('kind', (c) => c.kind), col('status', (c) => c.status ?? ''), col('hull', (c) => (c.integrity ?? '') && `${c.integrity}%`), col('hostile', (c) => (c.hostile ? 'yes' : ''))]) : '', s.missiles.length ? '\nMissiles\n' + table(s.missiles, [col('id', (m) => m.id), col('from', (m) => m.launcherName ?? m.launcherId), col('to', (m) => (m.targetsCurrentProbe ? 'YOU' : (m.targetName ?? m.targetId))), col('impact', (m) => eta(m.impactAt)), col('status', (m) => m.status ?? '')]) : ''].filter(Boolean).join('\n'));
    }
    case 'crew': {
      const id = await probeId();
      const crew = await call(cfg, 'GET', `/api/v1/probes/${encodeURIComponent(id)}/crew`);
      return show(crew, () => table(crew, [col('id', (m) => m.id), col('name', (m) => m.name), col('task', (m) => m.currentTask ?? 'ready'), col('progress', (m) => (m.progress !== undefined && m.progress !== null ? `${m.progress}%` : '')), col('where', (m) => (m.locationType === 'sector' ? coord(m.locationSector) : 'aboard'))]));
    }
    case 'alerts': {
      const id = await probeId();
      const list = await call(cfg, 'GET', `/api/v1/probes/${encodeURIComponent(id)}/alerts`, { query: { unread: flags.unread ? 1 : undefined } });
      return show(list, () => table(list, [col('when', (a) => (a.createdAt ? ago(a.createdAt) : '')), col('status', (a) => a.status ?? ''), col('severity', (a) => a.severity ?? ''), col('title', (a) => a.title), col('message', (a) => (a.message ?? '').slice(0, 80))]));
    }
    case 'archive': {
      const a = await call(cfg, 'GET', '/api/v1/archive');
      return show(a, () => [table(a.sectors, [col('sector', (s) => coord(s.coord)), col('names', (s) => s.names.join(', ')), col('stars', (s) => s.stars), col('hab', (s) => s.habitable), col('danger', (s) => (s.danger ? 'yes' : '')), col('scut', (s) => (s.scut ? 'yes' : '')), col('mineable', (s) => s.mineable ?? ''), col('est', (s) => (s.estimated ? 'yes' : ''))]), a.bookmarks.length ? '\nBookmarks\n' + table(a.bookmarks, [col('sector', (b) => coord(b.coord)), col('name', (b) => b.name), col('note', (b) => b.note ?? '')]) : ''].filter(Boolean).join('\n'));
    }
    case 'jobs': {
      const jobs = await call(cfg, 'GET', '/api/v1/jobs');
      return show(jobs, () => table(jobs.slice().reverse(), [col('id', (j) => j.id.slice(0, 8)), col('probe', (j) => j.probeId), col('state', (j) => j.state), col('name', (j) => j.name), col('message', (j) => j.message.slice(0, 60)), col('started', (j) => ago(j.startedAt))]));
    }
    case 'job': {
      if (!rest[0]) die('guppi job <id>');
      const jobs = await call(cfg, 'GET', '/api/v1/jobs');
      const full = jobs.find((j) => j.id === rest[0] || j.id.startsWith(rest[0]));
      if (!full) die('No such job.');
      const j = await call(cfg, 'GET', `/api/v1/jobs/${full.id}`);
      return show(j, () => [`${j.name} · ${j.state} · ${j.message}`, ...j.log.map((l) => `${new Date(l.at).toISOString().slice(11, 19)} ${l.tone ? `[${l.tone}] ` : ''}${l.text}`)].join('\n'));
    }
    case 'outposts': {
      const list = await call(cfg, 'GET', '/api/v1/outposts');
      return show(list, () => table(list, [col('id', (o) => o.id.slice(0, 8)), col('name', (o) => o.name), col('sector', (o) => coord(o.coord)), col('resource', (o) => o.resource), col('mined', (o) => `${o.mined} / ${o.total}`), col('status', (o) => o.status), col('active', (o) => (o.active ? (o.running ? 'running' : 'waiting') : 'paused'))]));
    }
    case 'recipes': {
      const list = await call(cfg, 'GET', '/api/v1/recipes');
      return show(list, () => table(list, [col('id', (r) => r.id), col('name', (r) => r.name), col('by', (r) => r.craftableBy.join('/')), col('secs', (r) => r.durationSeconds), col('needs', (r) => r.ingredients.map((i) => `${i.quantity} ${i.type}`).join(', '))]));
    }
    case 'events': {
      const since = flags.since !== undefined ? Number(flags.since) : undefined;
      const fmt = (e) => (json ? JSON.stringify(e) : `${new Date(e.at).toISOString().slice(11, 19)} #${e.seq} ${e.type}${e.probeId ? ` probe ${e.probeId}` : ''}: ${e.type === 'job' ? `${e.name} → ${e.state} (${e.message})` : e.type === 'alert' ? `${e.title}${e.message ? ` — ${e.message}` : ''}` : e.type === 'missile' ? `${e.launcherName ?? e.launcherId} → ${e.inbound ? 'YOU' : (e.targetName ?? e.targetId)}` : e.type === 'arrival' ? `${e.name} arrived at ${coord(e.sector)}` : JSON.stringify(e)}`);
      if (flags.follow) {
        await stream(cfg, since, (e) => out(fmt(e)));
        return;
      }
      const r = await call(cfg, 'GET', '/api/v1/events', { query: { since: since ?? 0 } });
      return json ? out(r) : out(r.events.map(fmt).join('\n') || `(no events; latest #${r.latest})`);
    }
    case 'openapi':
      return out(await call(cfg, 'GET', '/api/v1/openapi.json'));

    // ── Actions ──
    case 'select':
      return out(await act('select-probe', { probeId: String(rest[0] ?? die('guppi select <probeId>')) }));
    case 'jump': {
      if (rest.length < 3) die('guppi jump X Y Z');
      const r = await act('jump', { probeId: await probeId(), target: parseCoord(rest.slice(0, 3)), mode: flags.voyage ? 'voyage' : 'jump', scanOnArrival: !!flags.scan, reserve: flags.reserve !== undefined ? Number(flags.reserve) : undefined });
      return show(r, () => (r.jobId ? `Voyage started (job ${r.jobId.slice(0, 8)}): ${r.hops} hops as ${r.jumps} jump${r.jumps === 1 ? '' : 's'}` : `Jump accepted: ${r.hops} hop${r.hops === 1 ? '' : 's'}`));
    }
    case 'scan': {
      const r = await act('scan', { probeId: await probeId() });
      return show(r, () => `Scan started (job ${r.jobId.slice(0, 8)})`);
    }
    case 'mine': {
      if (!rest[0] || flags.amount === undefined) die('guppi mine <objectId> --amount <ECE> [--resources a,b] [--mannies a,b] [--container id]');
      const r = await act('mine', { probeId: await probeId(), objectId: rest[0], amount: Number(flags.amount), resources: flags.resources ? String(flags.resources).split(',') : undefined, mannyIds: flags.mannies ? String(flags.mannies).split(',') : undefined, containerId: flags.container });
      return show(r, () => `Mining run started (job ${r.jobId.slice(0, 8)}) with ${r.mannyIds.length} Mann${r.mannyIds.length === 1 ? 'y' : 'ies'} for ${r.resources.join(', ')}`);
    }
    case 'craft': {
      if (!rest[0]) die('guppi craft <recipe> [--count N]');
      const r = await act('craft', { probeId: await probeId(), recipe: rest[0], count: flags.count !== undefined ? Number(flags.count) : 1, mannyIds: flags.mannies ? String(flags.mannies).split(',') : undefined });
      return show(r, () => `Craft queue started (job ${r.jobId.slice(0, 8)})${r.printer ? ' on the atomic printer' : ''}`);
    }
    case 'order': {
      if (rest.length < 2) die('guppi order <mannyId> <action> [--body json]');
      return out(await act('order', { probeId: await probeId(), mannyId: rest[0], action: rest[1], body: flags.body ? JSON.parse(flags.body) : undefined }));
    }
    case 'recall':
      if (!rest[0]) die('guppi recall <mannyId>');
      return out(await act('recall', { probeId: await probeId(), mannyId: rest[0] }));
    case 'fire': {
      if (!rest[0]) die('guppi fire <targetId> [--manny id] [--missile id]');
      const r = await act('fire', { probeId: await probeId(), targetId: rest[0], mannyId: flags.manny, missileItemId: flags.missile });
      return show(r, () => `Missile preparation started by ${r.mannyId}; launch in about one minute.`);
    }
    case 'stop':
      if (!rest[0]) die('guppi stop <jobId>');
      return out(await act('stop-job', { id: rest[0] }));
    case 'outpost':
      if (!['pause', 'resume'].includes(rest[0]) || !rest[1]) die('guppi outpost pause|resume <id>');
      return out(await act(`outpost-${rest[0]}`, { id: rest[1] }));
    case 'bookmark': {
      if (rest.length < 4) die('guppi bookmark X Y Z <name> [--note text]');
      return out(await act('bookmark', { target: parseCoord(rest.slice(0, 3)), name: rest.slice(3).join(' '), note: flags.note }));
    }
    case 'game': {
      if (rest.length < 2) die('guppi game <METHOD> <path> [--body json]');
      return out(await call(cfg, 'POST', '/api/v1/game', { body: { method: rest[0].toUpperCase(), path: rest[1], body: flags.body ? JSON.parse(flags.body) : undefined } }));
    }
    default:
      if (VERBS.actions.some((a) => a.name === cmd)) return out(await act(cmd, flags.body ? JSON.parse(flags.body) : {}));
      die(`Unknown command ${cmd}. Run guppi help.`);
  }
}

main().catch((e) => {
  if (e instanceof ApiError) {
    if (json) out({ error: e.message, code: e.code, status: e.status, ...(e.body?.data ? { data: e.body.data } : {}) });
    else process.stderr.write(`guppi: ${e.message}${e.code ? ` (${e.code})` : ''}\n`);
    process.exit(e.status === 401 ? 3 : e.status === 403 ? 4 : 2);
  }
  die(e.message);
});
