import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

(globalThis as { localStorage?: unknown }).localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ ??= 'test';

import { createEventHub, createRemoteServer, RemoteCallError, type AgentScope } from '../electron/remote-server';
import { handleRemoteCall, NotConnected } from '../src/state/remote-host';
import { handleAgentCall, installAgentEvents } from '../src/state/agent-host';
import { AGENT_ACTIONS, AGENT_READS, openapiSpec } from '../src/core/agent-api';
import { useSession } from '../src/state/session';
import { useJobs } from '../src/state/jobs';
import { voyageTiming } from '../src/state/automations';
import { Scheduler } from '../src/core/scheduler';
import { createSimulator } from '../src/core/simulator/world';
import { createGame } from '../src/core/game';
import verbs from '../cli/verbs.json';

const TOKEN = 'agent-token-0123456789abcdefghij';
const CLI = path.resolve(__dirname, '../cli/guppi.mjs');
const MCP = path.resolve(__dirname, '../cli/mcp.mjs');
let root: string;
let base: string;
let server: ReturnType<typeof createRemoteServer>;
let scope: AgentScope = 'control';
let dangerous = false;
const hub = createEventHub();

const call = async (kind: string, payload: unknown) => {
  try {
    return await handleRemoteCall(kind, payload);
  } catch (e) {
    if (e instanceof NotConnected) throw new RemoteCallError(e.message, 'not_connected');
    throw e;
  }
};

const until = async (fn: () => boolean | Promise<boolean>, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};

beforeAll(async () => {
  Object.assign(voyageTiming, { crewPollMs: 20, arrivalPollMs: 20 });
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'guppi-agent-'));
  await fs.writeFile(path.join(root, 'mobile.html'), '<!doctype html><title>GUPPI Mobile</title>');
  server = createRemoteServer({ token: () => TOKEN, staticRoot: root, call, agent: { scope: () => scope, allowDangerous: () => dangerous, events: hub } });
  const port = await server.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${port}`;
  // A faster simulator than the app's own connect() offers, so voyages and missiles finish within the test.
  const game = createGame(new Scheduler(createSimulator({ speed: 20, limit: 100_000 }), { spacingMs: 0 }));
  useSession.setState({ status: 'connected', mode: 'simulator', game, selectedProbeId: '1', error: null } as never);
  installAgentEvents((e) => hub.push(e));
});

afterAll(async () => {
  server.server.closeAllConnections();
  await server.close();
  await fs.rm(root, { recursive: true, force: true });
}, 30_000);

const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'X-GUPPI-Client': 'vitest' };
const get = (p: string) => fetch(`${base}${p}`, { headers: H });
const post = (p: string, body: unknown) => fetch(`${base}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) });

describe('agent api', () => {
  it('refuses without the token, with agents off, and writes with read-only scope', async () => {
    expect((await fetch(`${base}/api/v1/status`)).status).toBe(401);
    scope = 'off';
    expect((await get('/api/v1/status')).status).toBe(403);
    expect(((await (await get('/api/v1/status')).json()) as { code: string }).code).toBe('agents_off');
    scope = 'read';
    expect((await get('/api/v1/status')).status).toBe(200);
    const w = await post('/api/v1/actions/scan', { probeId: '1' });
    expect(w.status).toBe(403);
    expect(((await w.json()) as { code: string }).code).toBe('read_only');
    // The game passthrough enforces the same rule on mutations only.
    expect((await post('/api/v1/game', { method: 'GET', path: '/api/probe/1' })).status).toBe(403); // POST itself is blocked read-only
    scope = 'control';
  });

  it('serves the spec and the verb table, and the CLI ships the same verbs', async () => {
    const spec = (await (await get('/api/v1/openapi.json')).json()) as { openapi: string; paths: Record<string, unknown>; servers: { url: string }[] };
    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths)).toContain('/api/v1/state');
    expect(Object.keys(spec.paths)).toContain('/api/v1/actions/jump');
    expect(spec.servers[0].url).toBe(base);
    expect(openapiSpec('x').info.title).toBe('GUPPI Agent API');
    expect(AGENT_READS.map((r) => r.name)).toEqual(verbs.reads.map((r) => r.name));
    expect(AGENT_ACTIONS.map((a) => a.name)).toEqual(verbs.actions.map((a) => a.name));
  });

  it('returns one state snapshot with probe, crew, sector, contacts, missiles and jobs', async () => {
    const r = await get('/api/v1/state?probe=1');
    expect(r.status).toBe(200);
    const s = (await r.json()) as { probe: { id: string; name: string; raw?: unknown }; crew: unknown[]; sector: { bodies: unknown[]; mineable: unknown[]; contacts: { id: string }[]; missiles: unknown[]; refuelStation: boolean }; probes: unknown[]; jobs: unknown[]; settings: { maxHop: number } };
    expect(s.probe.name).toBe('Bob');
    expect(s.probe.raw).toBeUndefined(); // raw dropped unless asked
    expect(s.crew.length).toBe(4);
    expect(s.sector.mineable.length).toBeGreaterThan(0);
    expect(s.sector.refuelStation).toBe(true);
    expect(s.sector.contacts.map((c) => c.id).sort()).toEqual(['9', 'ship-sentinel']);
    expect(s.probes.length).toBe(4);
    expect(s.settings.maxHop).toBe(1);
    const raw = (await (await get('/api/v1/state?probe=1&raw=1')).json()) as { probe: { raw?: unknown } };
    expect(raw.probe.raw).toBeDefined();
  });

  it('validates action bodies and explains unknown endpoints', async () => {
    const bad = await post('/api/v1/actions/jump', { probeId: '1', target: { x: 1, y: 0, z: 0 } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/even/);
    const missing = await post('/api/v1/actions/mine', { probeId: '1' });
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toMatch(/objectId is required/);
    expect((await get('/api/v1/nope')).status).toBe(404);
    expect((await post('/api/v1/actions/launch-nukes', {})).status).toBe(404);
  });

  it('flies a far jump as a voyage job and streams its events', async () => {
    const before = hub.latest();
    const r = await post('/api/v1/actions/jump', { probeId: '3', target: { x: 4, y: 1, z: 1 } }); // Bill: 3 hops
    expect(r.status).toBe(200);
    const body = (await r.json()) as { jobId: string; jumps: number; hops: number };
    expect(body.hops).toBe(3);
    expect(body.jumps).toBe(3);
    await until(() => useJobs.getState().jobs.find((j) => j.id === body.jobId)?.state === 'done', 20_000);
    const ev = (await (await get(`/api/v1/events?since=${before}`)).json()) as { events: { type: string; id?: string; state?: string }[] };
    const states = ev.events.filter((e) => e.type === 'job' && e.id === body.jobId).map((e) => e.state);
    expect(states[0]).toBe('running');
    expect(states.at(-1)).toBe('done');
    const job = (await (await get(`/api/v1/jobs/${body.jobId}`)).json()) as { log: { text: string }[] };
    expect(job.log.filter((l) => /Jump to .* accepted/.test(l.text))).toHaveLength(3);
  }, 30_000);

  it('refuses dangerous actions until allowed, then fires', async () => {
    const denied = await post('/api/v1/actions/fire', { probeId: '1', targetId: 'ship-sentinel' });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe('dangerous_disabled');
    const viaGame = await post('/api/v1/game', { method: 'POST', path: '/api/probe/1/mannies/m-1a/ignite_missile', body: { targetId: 'ship-sentinel' } });
    expect(viaGame.status).toBe(403);
    dangerous = true;
    const ok = await post('/api/v1/actions/fire', { probeId: '1', targetId: 'ship-sentinel' });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { mannyId: string; result: { missile: { status: string } } };
    expect(body.mannyId).toBe('m-1a');
    expect(body.result.missile.status).toBe('preparing');
    dangerous = false;
  });

  it('passes documented game reads through and rejects undocumented paths', async () => {
    const r = (await (await post('/api/v1/game', { method: 'GET', path: '/api/probe/1' })).json()) as { status: number; data: { probe: { name: string } } };
    expect(r.status).toBe(200);
    expect(r.data.probe.name).toBe('Bob');
    const bad = await post('/api/v1/game', { method: 'GET', path: '/api/nothing-here' });
    expect(bad.status).toBe(400);
  });

  it('handles the agent call directly without a server too', async () => {
    const r = await handleAgentCall({ method: 'GET', path: '/api/v1/probes/1/crew', scope: 'read', allowDangerous: false });
    expect(r.status).toBe(200);
    expect((r.body as unknown[]).length).toBe(4);
  });
});

const run = (file: string, args: string[], input?: string) =>
  new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const child = spawn(process.execPath, [file, ...args], { env: { ...process.env, GUPPI_URL: base, GUPPI_TOKEN: TOKEN, GUPPI_CLIENT: 'vitest-cli' } });
    let out = '',
      err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({ code, out, err }));
    if (input !== undefined) child.stdin.end(input);
  });

describe('guppi command line', () => {
  it('reads state and probes as tables and as JSON', async () => {
    const state = await run(CLI, ['state', '--probe', '1']);
    expect(state.code).toBe(0);
    expect(state.out).toMatch(/Bob \(#1\)/);
    expect(state.out).toMatch(/Contacts: .*Others sentinel/);
    const probes = await run(CLI, ['probes', '--json']);
    expect(probes.code).toBe(0);
    expect((JSON.parse(probes.out) as { name: string }[]).map((p) => p.name)).toContain('Riker');
    const sector = await run(CLI, ['sector', '--probe', '1']);
    expect(sector.out).toMatch(/refuel station/);
    expect(sector.out).toMatch(/ship-sentinel/);
  }, 30_000);

  it('starts a scan and reports the job, and explains refusals with exit codes', async () => {
    const scan = await run(CLI, ['scan', '--probe', '1', '--json']);
    expect(scan.code).toBe(0);
    expect(JSON.parse(scan.out).jobId).toBeTruthy();
    const fire = await run(CLI, ['fire', 'ship-sentinel', '--probe', '1']);
    expect(fire.code).toBe(4);
    expect(fire.err).toMatch(/dangerous/);
    const bad = await run(CLI, ['status'].concat(['--token', 'wrong-token-0123456789abcdefghij']));
    expect(bad.code).toBe(3);
  }, 30_000);
});

describe('guppi-mcp server', () => {
  it('speaks MCP over stdio: initialize, list tools, call a read and an action', async () => {
    const msgs = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vitest', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'guppi_crew', arguments: { probeId: '1' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'guppi_bookmark', arguments: { target: { x: 2, y: 0, z: 0 }, name: 'Metal belt' } } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'guppi_fire', arguments: { probeId: '1', targetId: 'ship-sentinel' } } },
      { jsonrpc: '2.0', id: 6, method: 'nope' },
    ];
    const r = await run(MCP, [], msgs.map((m) => JSON.stringify(m)).join('\n') + '\n');
    expect(r.code).toBe(0);
    const replies = r.out.trim().split('\n').map((l) => JSON.parse(l) as { id: number; result?: Record<string, unknown>; error?: { code: number } });
    const byId = Object.fromEntries(replies.map((x) => [x.id, x]));
    expect((byId[1].result as { serverInfo: { name: string } }).serverInfo.name).toBe('guppi');
    const tools = (byId[2].result as { tools: { name: string; annotations: { readOnlyHint: boolean; destructiveHint?: boolean } }[] }).tools;
    expect(tools.map((t) => t.name)).toContain('guppi_jump');
    expect(tools.find((t) => t.name === 'guppi_state')!.annotations.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'guppi_fire')!.annotations.destructiveHint).toBe(true);
    const crew = JSON.parse((byId[3].result as { content: { text: string }[] }).content[0].text) as unknown[];
    expect(crew).toHaveLength(4);
    expect((byId[4].result as { isError?: boolean }).isError).toBeUndefined();
    expect((byId[5].result as { isError?: boolean; content: { text: string }[] }).isError).toBe(true);
    expect((byId[5].result as { content: { text: string }[] }).content[0].text).toMatch(/dangerous/);
    expect(byId[6].error!.code).toBe(-32601);
  }, 30_000);
});
