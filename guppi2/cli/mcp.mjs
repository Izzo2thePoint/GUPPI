#!/usr/bin/env node
// guppi-mcp: a Model Context Protocol server (stdio) that exposes GUPPI's Agent
// API as tools, so Claude Desktop, Claude Code, Cursor and other MCP clients can
// read the fleet and give orders through GUPPI's safety rails. No dependencies:
// JSON-RPC 2.0 messages, one per line, on stdin/stdout. Logs go to stderr.
import readline from 'node:readline';
import { ApiError, VERSION, loadConfig, runTool, tools } from './lib.mjs';

const cfg = { ...loadConfig(), client: process.env.GUPPI_CLIENT ?? 'guppi-mcp' };
const log = (...a) => process.stderr.write(a.map(String).join(' ') + '\n');
const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => write({ jsonrpc: '2.0', id, result });
const fail = (id, code, message, data) => write({ jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } });

const TOOLS = tools().map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
  annotations: t.kind === 'read' ? { readOnlyHint: true, openWorldHint: false } : { readOnlyHint: false, destructiveHint: !!t.verb?.dangerous, openWorldHint: false },
}));

const INSTRUCTIONS = `GUPPI is the mission-control app for the game Neumann Probe; these tools drive it on the player's PC.
Start with guppi_state to see the fleet, the probe in command, its crew, its sector (bodies, mineable targets, contacts, missiles) and running jobs.
Sectors sit on a lattice where x + y + z must be even and coordinates are relative to the player's home sector. Jumps are limited to the player's "sectors per jump" setting; longer trips become voyages (jobs). Jobs run on the PC: follow them with guppi_jobs / guppi_job and guppi_events.
Mining moves 0.05 ECE per Manny trip; deuterium goes straight to the tank. The atomic printer runs one job at a time. Firing a missile (guppi_fire) is irreversible and is refused unless the player allowed dangerous actions in GUPPI.
Every call goes through GUPPI's own request lane below the player's clicks, is validated against the game's documented API, and is never re-sent blindly: if a result says "uncertain", check the state before repeating an order.`;

async function handle(msg) {
  const { id, method, params } = msg;
  const notification = id === undefined || id === null;
  try {
    switch (method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'guppi', version: VERSION },
          instructions: INSTRUCTIONS,
        });
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return;
      case 'ping':
        return reply(id, {});
      case 'tools/list':
        return reply(id, { tools: TOOLS });
      case 'tools/call': {
        const name = params?.name;
        if (!TOOLS.some((t) => t.name === name)) return fail(id, -32602, `Unknown tool ${name}`);
        try {
          const result = await runTool(cfg, name, params?.arguments ?? {});
          return reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result && typeof result === 'object' && !Array.isArray(result) ? result : undefined });
        } catch (e) {
          const text = e instanceof ApiError ? `${e.message}${e.code ? ` (${e.code})` : ''}${e.body?.data ? `\n${JSON.stringify(e.body.data)}` : ''}` : e.message;
          return reply(id, { content: [{ type: 'text', text }], isError: true });
        }
      }
      case 'resources/list':
        return reply(id, { resources: [] });
      case 'prompts/list':
        return reply(id, { prompts: [] });
      default:
        if (notification) return;
        return fail(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    if (!notification) fail(id, -32603, e.message);
  }
}

let pending = 0;
const track = (p) => {
  pending++;
  void p.finally(() => pending--);
};
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  if (Array.isArray(msg)) msg.forEach((m) => track(handle(m)));
  else track(handle(msg));
});
// When the client closes stdin, finish the calls in flight before exiting.
rl.on('close', async () => {
  while (pending > 0) await new Promise((r) => setTimeout(r, 10));
  process.exit(0);
});
log(`guppi-mcp ${VERSION} ready (GUPPI at ${cfg.url}${cfg.token ? '' : ', not paired: run guppi pair first'})`);
