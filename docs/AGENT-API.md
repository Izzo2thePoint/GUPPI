# GUPPI for scripts and AI agents

GUPPI can be driven by things that aren't you: a shell script, a cron job, or an AI agent such as Claude, Cursor or a custom bot. Nothing is built into GUPPI; it offers a seam that any of them can plug into, in three layers:

| Layer | What it is | Use it when |
| --- | --- | --- |
| **Agent API** | A local HTTP API on the same port as the phone remote, with an OpenAPI spec and an event stream | You're writing code, or your agent speaks HTTP |
| **`guppi` command line** | A zero-dependency Node command over that API, with tables for people and `--json` for machines | Anything that can run a shell command (Claude Code, Codex, scripts) |
| **`guppi-mcp` server** | A Model Context Protocol server exposing every verb as a tool | Claude Desktop, Claude Code, Cursor and other MCP clients |

Why go through GUPPI rather than hit the game's API with your key? Because every call then gets GUPPI's rules of engagement: it is validated against the game's documented API before it is sent, it waits its turn behind your own clicks in one rate-limited lane, it is never re-sent blindly when the outcome is unknown, and it gets GUPPI's brains (contacts and missile parsing, the sector archive, one-sector-per-jump voyages, outposts, craft planning) as single verbs. And your key never leaves the desktop.

## Turning it on

1. In GUPPI, open **Settings → Phone & agent access** and switch on **Enable remote access**.
2. Under **AI agents & scripts**, choose a scope: **Read-only** (agents can look, not act) or **Control** (agents can give orders).
3. Leave **Allow dangerous actions** off unless you want agents to fire missiles, jettison cargo, assemble probes, detach or drop containers, or launch asteroids. Off, an agent gets a refusal that tells it to ask you.

Everything an agent does appears in **Activity**, labelled with the agent's name, and runs at *automation* priority, below your own clicks, so a chatty agent can't starve the interface of rate budget.

The server listens on every interface (default port 47811) so the phone can reach it. The pairing token is the only credential: treat it like a password. **Unpair all phones** issues a new one and locks every client out.

## The `guppi` command line

**Install.** Download `guppi-cli-<version>.tgz` from the [latest release](https://github.com/Izzo2thePoint/GUPPI/releases/latest) and run `npm install -g guppi-cli-<version>.tgz` (Node 22+). From a checkout: `npm install -g ./guppi2/cli`.

**Pair.** In Settings → Phone & agent access, click **Copy** under *Pair the command line*, then run it:

```sh
guppi pair "http://192.168.1.20:47811/#pair=TOKEN"
guppi status
```

The pairing is saved to `~/.config/guppi/cli.json` (`%APPDATA%\guppi\cli.json` on Windows). `GUPPI_URL`, `GUPPI_TOKEN` and `GUPPI_CLIENT` override it, which is what you want in scripts and CI.

**Read.**

```sh
guppi state                 # everything about the probe in command, in a few lines
guppi state --probe 2       # another probe
guppi sector                # bodies, mineable targets, contacts, missiles
guppi probes | guppi crew | guppi jobs | guppi outposts | guppi archive | guppi recipes
guppi events --follow       # live: jobs, arrivals, alerts, inbound missiles
guppi state --json | jq .sector.contacts
```

**Act** (Control scope):

```sh
guppi jump 4 2 0            # one sector per jump; further trips become a voyage
guppi jump 4 2 0 --voyage --scan --reserve 20
guppi scan
guppi mine rock-home-1 --amount 0.2 --resources metals
guppi craft steel_plate --count 4
guppi order m-1a salvage --body '{"objectId":"wreck-home"}'
guppi recall m-1a
guppi fire ship-sentinel    # refused unless dangerous actions are allowed
guppi stop <jobId>
guppi game GET /api/probe/1/sector   # any documented game endpoint
```

Exit codes: 0 ok · 2 the API refused (message on stderr, or JSON with `--json`) · 3 not paired or wrong token · 4 scope or dangerous-action refusal. `guppi help` lists everything.

## The `guppi-mcp` server

MCP is how Claude Desktop, Claude Code, Cursor and others connect to tools. `guppi-mcp` speaks it over stdio and turns every GUPPI verb into a tool (`guppi_state`, `guppi_sector`, `guppi_jump`, `guppi_mine`, `guppi_fire`, …) with the right read-only and destructive annotations, so the client can ask before anything irreversible.

Install `guppi-cli` as above, then add the server to your client. Settings → Phone & agent access has a **Copy** button with this snippet filled in:

```json
{
  "mcpServers": {
    "guppi": {
      "command": "guppi-mcp",
      "env": { "GUPPI_URL": "http://192.168.1.20:47811", "GUPPI_TOKEN": "TOKEN" }
    }
  }
}
```

- **Claude Desktop:** Settings → Developer → Edit Config, paste under `mcpServers`.
- **Claude Code:** `claude mcp add guppi -e GUPPI_URL=http://… -e GUPPI_TOKEN=… -- guppi-mcp`
- **Cursor:** `.cursor/mcp.json` with the same block.

If you ran `guppi pair`, the `env` block is optional: the server reads the same saved pairing.

The server sends the client a short briefing (how sectors work, that jumps are one sector by default, that mining moves 0.05 ECE per trip, that `fire` is irreversible, and that an "uncertain" result means *check before repeating*), so the model starts with the rules of the game.

## The Agent API

Base URL: `http://<pc>:<port>` (the phone remote's address). Every call needs `Authorization: Bearer <token>`. Send `X-GUPPI-Client: <your name>` so Activity attributes your calls. Responses are JSON; `raw` game payloads are dropped unless you add `?raw=1`.

`GET /api/v1/openapi.json` is the full OpenAPI 3.1 document; `GET /api/v1/verbs` the verb table the CLI and MCP server share.

### Reads (Read-only scope or higher)

| Path | Returns |
| --- | --- |
| `/api/v1/status` | Connection, mode, selected probe, jobs, outposts, rate budget, your scope |
| `/api/v1/state?probe=ID` | One snapshot: fleet, the probe, crew, sector (below), jobs, outposts, unread alerts, `settings.maxHop` |
| `/api/v1/probes` · `/api/v1/probes/{id}` | The fleet; one probe with crew and inventory |
| `/api/v1/probes/{id}/sector` | `coord`, knowledge, SCUT, risk, `summary`, `bodies`, `mineable`, `relays`, `detachedContainers`, `refuelStation`, `contacts`, `missiles` |
| `/api/v1/probes/{id}/crew` · `/alerts?unread=1` | Mannies and tasks; alerts |
| `/api/v1/archive` | Every observed sector (the star map's data) and bookmarks |
| `/api/v1/jobs` · `/api/v1/jobs/{id}` | Automations; one with its log |
| `/api/v1/outposts` · `/api/v1/recipes` | Outposts; crafting recipes |
| `/api/v1/events?since=N` | Events after `N` (`job`, `arrival`, `alert`, `missile`, `probe`), or a live stream with `Accept: text/event-stream` (`Last-Event-ID` resumes) |

A probe that is moving has no sensors: `sector` comes back `null` with `sectorError.code = sensors_unavailable`.

### Actions (Control scope), `POST /api/v1/actions/<verb>`

| Verb | Body | Does |
| --- | --- | --- |
| `jump` | `probeId, target{x,y,z}, mode?, scanOnArrival?, reserve?` | One jump within the player's *sectors per jump*; otherwise a voyage job. Returns `hops`, `jumps`, `jobId` or `movement` |
| `scan` | `probeId` | Observe the 12 neighbours (job) |
| `mine` | `probeId, objectId, amount, resources?, mannyIds?, containerId?` | Mining run split into 0.05 ECE loads (job) |
| `craft` | `probeId, recipe, count?, mannyIds?` | Craft queue; printer recipes wait their turn (job) |
| `order` | `probeId, mannyId, action, body?` | Any documented Manny order |
| `recall` | `probeId, mannyId` | Recall a Manny |
| `fire` ⚠ | `probeId, targetId, mannyId?, missileItemId?` | One-minute preparation, then an irreversible launch |
| `stop-job` · `outpost-pause` · `outpost-resume` | `id` | Jobs and outposts |
| `select-probe` | `probeId` | Change the probe GUPPI shows |
| `bookmark` | `target, name, note?` | A star-map bookmark |

`POST /api/v1/game` `{ method, path, body }` sends any documented game request through GUPPI's lane and returns `{ status, data }` or `{ error, uncertain: true }` when the outcome could not be confirmed. Mutations need Control; ⚠ operations need dangerous actions allowed.

### Errors

Errors are `{ error, code }` with the HTTP status: `401` wrong token · `403` `agents_off`, `read_only` or `dangerous_disabled` (the message says which setting to change) · `400` `invalid_params` (which field, and why) · `404` · `409` a precondition (`position_unknown`, `already_moving`, `no_manny`, `sensors_unavailable`) · `422` the game refused (its code and data are included) · `503` GUPPI is not connected to the game.

## Rules of engagement for agents

If you are an agent reading this: start with `state`. Coordinates are relative to the player's home sector and `x + y + z` must be even. Jumps are one sector by default; a long trip is a voyage job you follow with `jobs`/`events`, not something you re-issue. Mining moves 0.05 ECE per Manny per trip and deuterium goes to the tank, not a container. The atomic printer runs one job at a time. Never repeat an order whose result said `uncertain`; read the state first. Firing a missile is irreversible and refused until the player allows it: ask them, don't work around it.
