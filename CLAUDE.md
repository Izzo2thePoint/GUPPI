# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent apps. Both are desktop companions for the browser game [Neumann Probe](https://neumann-probe.net/), and each is driven by the player's personal API key.

- `guppi2/`: **GUPPI 2**, the active app (Electron + React 19 + TypeScript + Vite + Tailwind v4). New work goes here.
- `desktop/`: **GUPPI 1.16**, the legacy app. It is kept unchanged. Its code is dense one-line style, but it was built against the live game. **Use it as the reference for real response shapes and game rules** (for example `desktop/src/lib/remote-mining.ts`, `mining.ts`, `asteroid-containers.ts`, `components/system-observation.tsx`, and `electron/self-test.ts` fixtures).
- `relay/`: optional Cloudflare Worker that hosts GUPPI Mobile on https and relays `/api/*` calls to the game (CORS). `build.mjs` builds the phone app into `relay/public`; tested by `guppi2/tests/relay.test.ts`.
- `docs/`: `GUPPI-2-ANALYSIS.md` (the design rationale, v1 vs v2), `RELEASE-NOTES.md`, `screenshots/`.
- `.github/workflows/guppi2-release.yml`: CI and release pipeline for guppi2. `guppi-mobile-web.yml` publishes GUPPI Mobile to GitHub Pages and/or Cloudflare when either is configured (it skips each target otherwise).

## guppi2 commands

Run these from `guppi2/`. The package manager is pnpm (v10) and Node must be 22 or newer.

```bash
pnpm install --frozen-lockfile
pnpm dev                 # browser build at http://localhost:5173; choose "Explore with the simulator" (offline)
                         # GUPPI Mobile: http://localhost:5173/mobile.html (phone-sized window, "Try the simulator")
pnpm test                # vitest run (all suites in tests/)
pnpm exec vitest run tests/outposts.test.ts            # one file
pnpm exec vitest run tests/core.test.ts -t "parity"    # one test by name
pnpm typecheck           # renderer (tsconfig.json) + Electron (tsconfig.electron.json)
pnpm build               # vite → renderer/, esbuild → build/electron/*.cjs
pnpm start               # run the built Electron app
GUPPI_DEV_URL=http://localhost:5173 pnpm start   # Electron shell against the dev server (needs pnpm build:electron)
pnpm package:win | package:linux                  # electron-builder → release/
```

There is no linter. Treat `pnpm typecheck` + `pnpm test` + `pnpm build` as the pre-push gate, since CI runs exactly these. Browser mode with a real key uses the Vite proxy at `/game`, which forwards to neumann-probe.net.

**Releases:** CI publishes GitHub Release `v<version>` automatically when a push to `main` carries a `guppi2/package.json` version that has no tag yet. To ship a release, bump `"version"` in the PR. PR runs only build the installers and attach them as artifacts.

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
- **`electron/`**: `gateway.ts` holds the key in memory or in the OS keychain (`safeStorage`). It forwards only paths that match documented operations to `https://neumann-probe.net`, uses `redirect: manual`, and redacts the key from responses. `main.ts` serves the renderer on `guppi://app` with a strict CSP and blocks every non-app request. The renderer never sees the key.
- **UI**: `components/ui/*` is the kit. `schema-form.tsx` renders any operation body from its schema, and `state/pickers.ts` supplies live-data pickers (`pickersForAction` narrows them per Manny order). Views are lazy-loaded from `App.tsx`; register new ones in `state/nav.ts`, `components/layout/nav-items.tsx` and the `views` map in `App.tsx`.
- **GUPPI Mobile** (`mobile.html` → `src/mobile/*`, a second Vite entry): phone UI that reuses `state/` and `components/`. Session modes beyond desktop/proxy/simulator: `remote` (phone → GUPPI on the PC) and `direct` (phone → game or relay with the key in page memory). `mobile/connection.ts#useRunner` starts automations on the PC in remote mode, locally otherwise.
- **Phone remote**: `electron/remote-server.ts` (opt-in HTTP server, default port 47811, bearer pairing token, lockout, static phone pages with a `connect-src 'self'` CSP) → IPC `remote:call` → `state/remote-host.ts` in the renderer. Game calls from the phone are mapped back to a documented operation with `catalog.ts#parseWire` and sent through the PC's own scheduler at user priority; `action` calls start/stop jobs and pause/resume outposts. The phone never gets the key. Pairing links are `http://<pc>:<port>/#pair=<token>`.
- **Simulator** (`core/simulator/world.ts`): an in-memory game that mirrors the real response shapes, including rate limiting. It powers demo mode and the e2e-style tests. When you learn a new real game shape, update the simulator too so tests keep exercising it.

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
- Sector coordinates are always relative to the player's home sector.

## Verifying UI changes

Tests cover `core/` and `state/` against the simulator. For UI changes, run `pnpm dev`, open the simulator and drive the affected screen. In Claude Code cloud sessions, Chromium is preinstalled for Playwright-style scripted checks.

## desktop/ (GUPPI 1.16, legacy)

Run these from `desktop/`, on Windows. Build with `pnpm run build`, then `pnpm start`. Type-check with `pnpm exec tsc -p tsconfig.json --noEmit` and `pnpm exec tsc -p tsconfig.electron.json --noEmit`. Tests are the `node scripts/test-*.cjs` scripts, plus Windows-only diagnostic executables (see `README.md`). Its saved data lives in the `Neumann Mission Cockpit` app-data folder.
