import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

(globalThis as { localStorage?: unknown }).localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

import { createRemoteServer, RemoteCallError } from '../electron/remote-server';
import { handleRemoteCall, NotConnected, remoteStatus, type RemoteStatus } from '../src/state/remote-host';
import { useSession } from '../src/state/session';
import { Scheduler } from '../src/core/scheduler';
import { createGame } from '../src/core/game';
import { remoteTransport, PairingRejected } from '../src/core/transport';
import { useJobs } from '../src/state/jobs';

const TOKEN = 'test-token-0123456789abcdefghij';
let root: string;
let base: string;
let server: ReturnType<typeof createRemoteServer>;
let connected = true;

// The same translation Electron's main process does: renderer errors → HTTP.
const call = async (kind: string, payload: unknown) => {
  if (!connected) throw new RemoteCallError('not connected', 'not_connected');
  try {
    return await handleRemoteCall(kind, payload);
  } catch (e) {
    if (e instanceof NotConnected) throw new RemoteCallError(e.message, 'not_connected');
    throw e;
  }
};

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'guppi-remote-'));
  await fs.mkdir(path.join(root, 'assets'));
  await fs.writeFile(path.join(root, 'mobile.html'), '<!doctype html><title>GUPPI Mobile</title>');
  await fs.writeFile(path.join(root, 'assets', 'app.js'), 'console.log(1)');
  server = createRemoteServer({ token: () => TOKEN, staticRoot: root, call });
  const port = await server.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${port}`;
  await useSession.getState().connect('simulator', '');
});

afterAll(async () => {
  await server.close();
  await fs.rm(root, { recursive: true, force: true });
});

const auth = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

describe('phone remote server', () => {
  it('serves GUPPI Mobile with a strict CSP and nothing outside its folder', async () => {
    const home = await fetch(`${base}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('GUPPI Mobile');
    expect(home.headers.get('content-security-policy')).toContain("connect-src 'self'");
    expect((await fetch(`${base}/assets/app.js`)).status).toBe(200);
    expect((await fetch(`${base}/..%2f..%2fetc%2fpasswd`)).status).toBeGreaterThanOrEqual(400);
    expect((await fetch(`${base}/assets/%2e%2e/%2e%2e/secret`)).status).toBeGreaterThanOrEqual(400);
  });

  it('requires the pairing token for every API call', async () => {
    expect((await fetch(`${base}/remote/v1/status`)).status).toBe(401);
    expect((await fetch(`${base}/remote/v1/status`, { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
    const ok = await fetch(`${base}/remote/v1/status`, { headers: auth });
    expect(ok.status).toBe(200);
    const s = (await ok.json()) as RemoteStatus;
    expect(s.connected).toBe(true);
  });

  it('rejects oversized and malformed bodies', async () => {
    const big = await fetch(`${base}/remote/v1/game`, { method: 'POST', headers: auth, body: JSON.stringify({ x: 'y'.repeat(70_000) }) }).catch(() => null);
    expect(big === null || big.status === 400).toBe(true);
    const bad = await fetch(`${base}/remote/v1/game`, { method: 'POST', headers: auth, body: '{nope' });
    expect(bad.status).toBe(400);
  });

  it('answers 503 while the PC is not connected to the game', async () => {
    connected = false;
    expect((await fetch(`${base}/remote/v1/status`, { headers: auth })).status).toBe(503);
    connected = true;
  });
});

describe('phone → PC → game, end to end', () => {
  const phone = () => createGame(new Scheduler(remoteTransport(base, TOKEN), { spacingMs: 0 }));

  it('reads game data through the PC', async () => {
    const probes = await phone().probes();
    expect(probes.map((p) => p.name)).toContain('Bob');
    const crew = await phone().mannies('1');
    expect(crew.length).toBeGreaterThan(0);
    // It went through the PC's own scheduler (single request lane).
    expect(useSession.getState().activity.some((a) => a.label.startsWith('Phone ·'))).toBe(true);
  });

  it('sends orders through the PC and reports game errors faithfully', async () => {
    const game = phone();
    const [m] = await game.mannies('1');
    await game.mannyAction('1', m.id, 'craft', { recipe: 'steel_bar' });
    await expect(game.mannyAction('1', m.id, 'craft', { recipe: 'steel_bar' })).rejects.toMatchObject({ status: 409 });
  });

  it('refuses undocumented requests on the PC side', async () => {
    const res = await fetch(`${base}/remote/v1/game`, { method: 'POST', headers: auth, body: JSON.stringify({ method: 'GET', path: '/api/admin' }) });
    const body = (await res.json()) as { status: number };
    expect(body.status).toBe(400);
  });

  it('rejects a phone with the wrong pairing token', async () => {
    const game = createGame(new Scheduler(remoteTransport(base, 'wrong-token-zzzzzzzzzzzzzz'), { spacingMs: 0 }));
    await expect(game.probes()).rejects.toBeInstanceOf(PairingRejected);
  });

  it('starts automations on the PC and reports them in status', async () => {
    const r = await fetch(`${base}/remote/v1/action`, { method: 'POST', headers: auth, body: JSON.stringify({ type: 'scan', probeId: '1' }) });
    const { jobId } = (await r.json()) as { jobId: string };
    expect(jobId).toBeTruthy();
    expect(remoteStatus().jobs.some((j) => j.id === jobId)).toBe(true);
    const stop = await fetch(`${base}/remote/v1/action`, { method: 'POST', headers: auth, body: JSON.stringify({ type: 'stop-job', id: jobId }) });
    expect(stop.status).toBe(200);
    useJobs.getState().stopAll();
  });

  it('locks out a caller after repeated bad tokens', async () => {
    for (let i = 0; i < 10; i++) await fetch(`${base}/remote/v1/status`, { headers: { Authorization: 'Bearer wrong' } });
    expect((await fetch(`${base}/remote/v1/status`, { headers: auth })).status).toBe(429);
  });
});
