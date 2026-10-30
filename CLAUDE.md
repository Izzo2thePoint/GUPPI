# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent apps (plus `relay/`). Both are desktop companions for the browser game [Neumann Probe](https://neumann-probe.net/), and each is driven by the player's personal API key.

- `guppi2/`: **GUPPI 2**, the active app (Electron + React 19 + TypeScript + Vite + Tailwind v4). New work goes here. **Read `guppi2/DESIGN.md` before any UI change**: it is the design system (Impeccable-based) and lists what not to do.
- `legacy/guppi-1.16/`: **GUPPI 1.16**, the legacy app. It is kept unchanged. Its code is dense one-line style, but it was built against the live game. **Use it as the reference for real response shapes and game rules** (for example `legacy/guppi-1.16/src/lib/remote-mining.ts`, `departure-queue.ts`, `probe-construction.ts`, `mining.ts`, `asteroid-containers.ts`, `components/system-observation.tsx`, and `electron/self-test.ts` fixtures).
- `guppi2/cli/`: the **`guppi` command line and `guppi-mcp` MCP server** (plain Node ESM, no dependencies, packaged as `guppi-cli-<version>.tgz` on releases). `cli/verbs.json` is the single verb table shared with the app's Agent API (`src/core/agent-api.ts` imports it); change the API there first.
- `relay/`: optional Cloudflare Worker that hosts GUPPI Mobile on https and relays `/api/*` calls to the game (CORS). `build.mjs` builds the phone app into `relay/public`; tested by `guppi2/tests/relay.test.ts`.
- `docs/`: `GUPPI-2-ANALYSIS.md` (the design rationale, v1 vs v2), `RELEASE-NOTES.md`, `screenshots/`.
- `.github/workflows/guppi2-release.yml`: CI and release pipeline for guppi2. `guppi-mobile-web.yml` publishes GUPPI Mobile to GitHub Pages and/or Cloudflare when either is configured (it skips each target otherwise).

## guppi2 commands

Run these from `guppi2/`. The package manager is pnpm (v10) and Node must be 22 or newer.

```bash
pnpm install --frozen-lockfile
pnpm dev                 # browser build at http://localhost:5173; add ?simulator (or run pnpm dev:sim) to open straight into the offline simulator
                         # GUPPI Mobile: http://localhost:5173/mobile.html (phone-sized window, "Try the simulator")
pnpm test                # vitest run (all suites in tests/)
pnpm exec vitest run tests/outposts.test.ts            # one file
pnpm exec vitest run tests/core.test.ts -t "parity"    # one test by name
pnpm typecheck           # renderer (tsconfig.json) + Electron (tsconfig.electron.json)
pnpm build               # vite → renderer/, esbuild → build/electron/*.cjs
pnpm start               # run the built Electron app
GUPPI_DEV_URL=http://localhost:5173 pnpm start   # Electron shell against the dev server (needs pnpm build:electron)
pnpm package:win | package:linux                  # electron-builder → release/
node cli/guppi.mjs help                           # the agent command line (no build step); tests spawn it and cli/mcp.mjs
```

There is no linter. Treat `pnpm typecheck` + `pnpm test` + `pnpm build` as the pre-push gate, since CI runs exactly these. Browser mode with a real key uses the Vite proxy at `/game`, which forwards to neumann-probe.net.

**Releases:** CI publishes GitHub Release `v<version>` automatically when a push to `main` carries a `guppi2/package.json` version that has no tag yet. To ship a release, bump `"version"` in the PR (and `cli/package.json`; CI overwrites both anyway). Installers are uploaded straight onto a draft release and it is published once all are there (no Actions artifact storage involved); the publish job then adds `SHA256SUMS.txt` and appends the hashes to the notes. Windows signing switches on when the secrets listed at the top of the workflow exist (Azure Trusted Signing or a `.pfx`), otherwise builds are unsigned. The check job also runs `pnpm audit --prod` (there are no runtime npm deps, so it must stay clean). Actions are pinned to commit hashes (Dependabot bumps them); keep the `# vN` comment next to each hash. The `build.electronFuses` block in `package.json` hardens the binary (no run-as-node, NODE_OPTIONS or inspect; asar-only with integrity check). PR runs only build the installers and attach them as artifacts when the account has storage left; that upload is best-effort. Re-pushing a tag whose release is already published builds nothing. `move-tags.yml` (Actions → Move tags) re-points tags after a history rewrite, only between commits with identical trees; Claude Code cloud sessions cannot push tags or write refs through the API themselves. Commits by the owner use the GitHub noreply address (history was rewritten to it before going public).

## guppi2 architecture

Data flows through these layers, top to bottom:

```
views/* ─ state/hooks.ts (TanStack Query) ─┐
state/jobs.ts + automations / outposts ────┼─► core/game.ts ─► core/scheduler.ts ─► core/transport.ts
                                            │                                          ├─ desktop: IPC → electron/gateway.ts (main process, holds key)
                                            │                                          ├─ proxy:   browser dev via Vite /game
                                            │                                          └─ simulator: core/simulator/world.ts (offline)
```

- **`core/catalog.json`** is a snapshot of the 68 documented endpoints (it is identical to v1's). `catalog.ts#compile` validates every request before it is sent: path segments, query bounds, body schema, and sector parity (x+y+z must be even). The operation descriptions in the JSON document game semantics, so read them when behaviour is unclear.
- **`core/scheduler.ts`** is the single request lane shared by everything. Priority order is `user` > `automation` > `background`. Identical queued GETs are de-duplicated. It honours `Retry-After` and `X-RateLimit-*`, and it has an offline mode. **Invariant:** mutations are never retried except after a 429. A mutation that gets no confirmed response throws `UncertainOutcomeError`, and callers must not blindly re-send it.
- **`core/models.ts`** normalises game responses defensively and never throws on bad data. It also holds the sector query helpers (`allBodies`, `miningTargets`, `scutRelays`, `detachedContainers`, `hasRefuelStation`). **Always derive sector data through these helpers** rather than reading `sector.objects` directly, because nested bodies are easy to miss.
- **`state/hooks.ts`** holds the query hooks and query keys. A view's first load runs at user priority and later refetches run in the background (`opt()`). `useAction` wraps mutations: it refuses anything that collides with a running job's claims, shows toast lifecycle, and invalidates keys.
- **`state/jobs.ts`** + **`core/claims.ts`**: every long-running automation is a Job with resource claims (`manny:<id>`, `container:`, `asteroid:`, `printer`, `helm`; `probe` locks the whole probe). A voyage holds `helm` only, so crafting aboard continues during jumps. Jobs live outside the React tree, so a crashed view does not stop them.
- **`state/automations.ts`** contains craft queues, voyages, sector scans, mining runs and user routines. **`state/outpost-runner.ts`** + **`state/outposts.ts`** implement mining outposts (a port of v1 remote mining). Outposts are persisted, and active ones resume on reconnect (`App.tsx` `OutpostResume`). Poll intervals are exported as `outpostTiming`/`miningTiming` so tests can shorten them.
- **Persisted local state** (zustand + `safeStorage`, which never throws) covers settings, the sector archive and bookmarks, routines, and outposts.
- **Sector archive** (`state/archive.ts`): `SectorSummary` is what the star map draws (stars, habitable, danger via v1's rule, SCUT, refuel, mineable, estimated). **Every observation goes through `archiveSector()`**: the local sector in `useSector`, scans, voyage arrivals and outpost observations. A reading that states its own coordinates is filed there; a passive estimate never overwrites a real scan.
- **Fleet positions**: the fleet list (`GET /api/probes`) can omit a probe's `sector` and `movement`, so anything that needs positions uses `hooks.ts#useFleet()`, which merges each reachable probe's own record (shared with `useProbe`) into the list. The star map draws moving probes along their jump line.
- **`electron/`**: `gateway.ts` holds the key in memory or in the OS keychain (`safeStorage`). It forwards only paths that match documented operations to `https://neumann-probe.net`, uses `redirect: manual`, and redacts the key from responses. `main.ts` serves the renderer on `guppi://app` with a strict CSP and blocks every non-app request. The renderer never sees the key. **Privacy promise (README, SECURITY.md):** the app makes no network request except to the game and, only when the player clicks **Check for updates** (Settings → Updates, Help menu), to GitHub's release API (`electron/updates.ts`, IPC `app:check-update`; pure helpers tested in `tests/updates.test.ts`). Never add a scheduled or automatic outbound call. `openExternal` opens only `neumann-probe.net` and this project's `github.com` pages.
- **UI**: `components/ui/*` is the kit (`Readout` is the instrument for 0–100 quantities; no rings, gradients, glass or icon tiles, see `DESIGN.md`). `schema-form.tsx` renders any operation body from its schema, and `state/pickers.ts` supplies live-data pickers (`pickersForAction` narrows them per Manny order). Views are lazy-loaded from `App.tsx`; register new ones in `state/nav.ts`, `components/layout/nav-items.tsx` and the `views` map in `App.tsx`.
- **GUPPI Mobile** (`mobile.html` → `src/mobile/*`, a second Vite entry): phone UI that reuses `state/` and `components/`. Session modes beyond desktop/proxy/simulator: `remote` (phone → GUPPI on the PC) and `direct` (phone → game or relay with the key in page memory). `mobile/connection.ts#useRunner` starts automations on the PC in remote mode, locally otherwise.
- **Phone remote** (Settings → Phone & agent access): `electron/remote-server.ts` (opt-in HTTP server, default port 47811, bearer pairing token, lockout, static phone pages with a `connect-src 'self'` CSP) → IPC `remote:call` → `state/remote-host.ts` in the renderer. `remote.json` also holds `bind` (**Listen on**: `''` = all interfaces, a LAN/Tailscale address, or `127.0.0.1` for the CLI/MCP only); `main.ts#bindable` accepts only those. The built `mobile.html` carries the same CSP as a `<meta>` tag (`vite.config.ts#cspMeta`, build only) because GitHub Pages cannot send headers. Game calls from the phone are mapped back to a documented operation with `catalog.ts#parseWire` and sent through the PC's own scheduler at user priority; `action` calls start/stop jobs and pause/resume outposts. The phone never gets the key. Pairing links are `http://<pc>:<port>/#pair=<token>`.
- **Agent API** (`/api/v1/*` on the remote server): `electron/remote-server.ts` checks the token and the scope (`remote.json`: `agents: off|read|control`, `dangerous`), serves `/api/v1/events` (SSE + JSON) from an in-memory `EventHub`, and forwards the rest to the renderer as kind `agent` → `state/agent-host.ts#handleAgentCall`, which runs reads and actions through the game façade at **automation priority** with the agent's name as the Activity label. Dangerous verbs and dangerous game operations (`DANGEROUS_OPERATIONS` in `cli/verbs.json`) are refused unless allowed. `installAgentEvents()` pushes job, arrival, alert, missile and probe events through `window.guppi.remote.emit`. `guppi2/cli/{guppi,mcp}.mjs` are clients of this API; `tests/agent-api.test.ts` drives the server, the CLI and the MCP server (as child processes). Docs for agents live in `docs/AGENT-API.md` and the root `llms.txt`.
- **Themes** (`state/theme.ts`): OKLCH tokens in `index.css` use `@theme inline`, so setting `--accent` / `--tint-h` on an element recolours everything inside it. The probe in command sets the window's colours (`applyTheme` in `App.tsx`); each probe may have its own (`useThemes`, persisted), shown on its Fleet card via `themeStyle()`. The app default is stored under key `*`.
- **Tactical** (`views/tactical.tsx`): `models.ts#contacts()` lists other ships (sector `probes` plus ship-like objects, wrecks excluded; kind own/probe/others) and `models.ts#missiles()` reads `missile` objects defensively (several candidate field names for launcher, target and impact time; `targetsCurrentProbe` is the game's flag). Firing is `game.igniteMissile()` → `POST .../mannies/{mannyId}/ignite_missile` `{ targetId, missileItemId? }` (one-minute preparation by an embarked Manny); `game.missile()` follows one via `GET .../missiles/{missileId}`. `state/tactical.ts` keeps the session's launches. The Bridge shows an inbound strip from the same `missiles()` call. Real response shapes for missiles are not confirmed against the live game yet: when one is, update `normMissile` and the simulator.
- **Jump length**: the game accepts any distance in one `move`, but GUPPI never sends more than `settings.maxHop` sectors (default 1). `lattice.ts#planLegs` turns a destination into waypoints along `plotCourse`, and `startVoyage` expands every waypoint with it, so single jumps beyond the limit, voyages, **Leave when crew is ready** and the phone all go through `startVoyage`. Only `game.move` calls for a destination within `maxHop` bypass it.
- **Leaving an outpost**: a Manny only stays behind if it is standing idle in the sector when the probe jumps; one on a load the probe ordered is pulled back aboard. `outposts.ts#departureIssues` says who isn't ready, `automations.ts#readyToLeave` holds new loads (`useDeparture`) and waits before any voyage leg, and Navigation / phone jump offer **Leave when crew is ready**. Sensor/moving errors are transient waits in the outpost runner, never blockers.
- **Atomic printer**: one job at a time. Craft queues hold the `printer` claim across items and wait for the physical printer to be idle (`automations.ts#printerIdle`: a Manny on `assisting_atomic_printer` or a printer item with a task) before each order; a 409 refusal is waited out and retried. Manny crafts whose sub-parts need the printer queue for it too.
- **Building a probe**: `core/assembly.ts` holds the `assemble-probe` parts per model (from the catalog) and plans shortfalls through the craft planner; Workshop → Build a probe shows it.
- **Simulator** (`core/simulator/world.ts`): an in-memory game that mirrors the real response shapes, including rate limiting (`createSimulator({ speed, limit })`; raise `limit` in request-heavy tests). It powers demo mode and the e2e-style tests. When you learn a new real game shape, update the simulator too so tests keep exercising it.

## Game API facts (learned from v1, the catalog and bug reports)

- Stellar systems nest their planets, moons and belts under **`minableTargets`** and **`bookmarkTargets`**, not only under `planets` or `objects`. Missing these once broke sensors and mining entirely.
- Mineable bodies are top-level objects with `mannyMineable: true`, plus entries in `minableTargets`. Exclude `estimated` and `inTransit` bodies and exhausted `resourceAmounts`.
- Manny cargo is **0.05 ECE per trip** (`cargo.capacity`). Split larger amounts into loads.
- Mining deuterium goes straight into the probe tank at **0.01 ECE = 1 tank point**. **Detached containers cannot hold deuterium.**
- `refill-deuterium-tank` requires a deuterium refuel station in the sector.
- `relayId` is an **integer**. Turning on a relay needs a local star and one `integrated_circuit`.
- Remote orders, for a Manny in another sector, need the probe stationary and both sectors reporting `dataFreshness` of `live`/`degraded_live`, `scutCoverageStatus: covered`, and a shared `scutNetworks` id. Remote mining requires `targetContainerId` (a detached container in the Manny's sector). Out of contact, a Manny's task reads `unknown_too_far`: wait, don't guess.
- Mining into a detached container leaves the Manny in that sector (`location.type: 'sector'`) rather than aboard.
- External sensors fail with code `sensors_unavailable` while the probe is moving.
- The atomic printer runs one job at a time; its assisting Manny shows `assisting_atomic_printer`, and the printer inventory item carries a `currentTask` (`GET .../inventory/{itemId}`). A second print is refused while it is busy.
- Missiles: the sector reading lists in-flight missiles as `missile` objects with `targetsCurrentProbe`; firing is `POST .../mannies/{mannyId}/ignite_missile` with `targetId` (and optional `missileItemId`, else the first missile aboard), a one-minute Manny preparation; `GET .../missiles/{missileId}` returns preparation, flight or history. `GET .../sector/autonomous-units` lists deployed Mannies and Others auxiliaries. Others craft appear as `others_standard_ship`; their wrecks as `others_mothership_wreck`.
- `assemble-probe` takes two **empty** additional containers plus parts (standard: 1 deuterium engine, 1 SCUT relay, 5 electric motors, 2 atomic printer parts, 4 solar panels; the deuterium tanker also needs 10 steel plates, 2 linear actuators and 1 integrated circuit). It is a 3-hour exterior task; leaving the sector early strands the Manny.
- Sector coordinates are always relative to the player's home sector.

## Verifying UI changes

Tests cover `core/` and `state/` against the simulator. For UI changes, run `pnpm dev`, open `http://localhost:5173/?simulator#/<view>` (phone: `/mobile.html` at 390px wide) and drive the affected screen. In Claude Code cloud sessions, Chromium is preinstalled for Playwright-style scripted checks. Also run Impeccable's detector against the page (`DESIGN.md` → Checking your work); disabled buttons are the only expected contrast findings.

## legacy/guppi-1.16/ (GUPPI 1.16, legacy)

Run these from `legacy/guppi-1.16/`, on Windows. Build with `pnpm run build`, then `pnpm start`. Type-check with `pnpm exec tsc -p tsconfig.json --noEmit` and `pnpm exec tsc -p tsconfig.electron.json --noEmit`. Tests are the `node scripts/test-*.cjs` scripts, plus Windows-only diagnostic executables (see its `README.md`; diagnostics write to `legacy/work/`). Its saved data lives in the `Neumann Mission Cockpit` app-data folder.
