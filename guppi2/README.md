# GUPPI 2

A ground-up rebuild of GUPPI, the desktop mission-control companion for [Neumann Probe](https://neumann-probe.net/). Same secure desktop model as 1.x, with a sturdier request engine, broader API coverage, safer automation and a new interface.

![GUPPI 2 Bridge](../docs/screenshots/guppi2-bridge.png)

> GUPPI 1.16 lives unchanged in [`../desktop`](../desktop). See [`../docs/GUPPI-2-ANALYSIS.md`](../docs/GUPPI-2-ANALYSIS.md) for the review of 1.x that shaped this version.

## Download

Get the latest version from the **[Releases page](https://github.com/Izzo2thePoint/GUPPI/releases/latest)**:

- **Windows:** `GUPPI-Setup-<version>.exe` is the installer and adds Start-menu and desktop shortcuts. `GUPPI-Portable-<version>.exe` runs without installing.
- **Linux:** `GUPPI-<version>-x86_64.AppImage`. Make it executable with `chmod +x`, then run it.

The builds are not code-signed yet, so Windows SmartScreen may warn you. Click **More info → Run anyway**.

## Highlights

**Stability**
- **One priority request lane.** Every screen and job shares a single scheduler. Your clicks go first, then automation, then background refreshes. Duplicate reads that are already queued share one request.
- **Rate-limit aware.** Honours `Retry-After` and `X-RateLimit-Remaining/Reset`, and keeps a minimum gap between requests that you can configure.
- **Never double-sends.** GET requests are retried with jittered backoff. Mutations are retried only after an explicit 429, which means the game did not accept them. If a mutation gets no confirmed response, GUPPI reports it as *outcome unknown* and does not resend it.
- **Offline detection.** After repeated network failures, background polling pauses and probes the link every 15 seconds. Your own actions are still attempted.
- **Validated before sending.** Every request is compiled against the documented API schema (68 endpoints), including the lattice rule that X + Y + Z must be even. Bad input never reaches the game.
- **Contained failures.** Each screen has its own error boundary, so one crash does not stop the cockpit or running automation. Response parsing tolerates partial and malformed data.
- **Resource claims.** Automations reserve the Mannies, containers, asteroids and helm they use. Manual orders that would collide are refused with a clear reason.

**Features**
- **Bridge:** probe dashboard with integrity, deuterium and cargo gauges, live jump progress with ETA, crew activity, local sector contacts, alerts and resources.
- **Fleet:** every probe in a grid or table view, with live telemetry, crew readiness and hop distance. You can take command of any probe with one click.
- **Navigation:** an interactive 3D star map (drag to rotate, scroll to zoom) showing visited sectors, archived scans, bookmarks, fleet positions and active jumps. It includes a jump planner with parity validation and hop counts, 12-neighbour sweeps, a local sector object tree with a raw-data inspector, and contextual Manny orders.
- **SCUT:** coverage, networks and relays. Switch on relays and install transit beacons.
- **Outposts:** remote mining that keeps running after you jump away, over SCUT.
- **Crew:** Manny cards with task progress and countdowns. Every documented Manny order is available through a schema-driven form whose pickers use live data. You can assign one order to several Mannies at once through the atomic batch endpoint. Rename and recall are included.
- **Inventory:** container capacity strip, per-container resources, grouped parts, storage moves, a routing-rules editor and reservation reassignment. Jettison requires typing a confirmation phrase.
- **Workshop:** recipes show have/need per ingredient, what will be prepared first, and what is missing. You can craft now or queue ×N in parallel across idle Mannies. Also covers probe upgrades, probe assembly, repairs and deuterium refills.
- **Automation:** craft queues, mining runs that stop before cargo overflows, managed voyages with a fuel reserve and auto-scan on arrival, neighbour sweeps, and a **routine builder** (command / wait / wait-until steps, cycles, dry run). Routines are saved locally.
- **Comms:** a two-pane inbox with pagination and an unread filter, a composer for probes and planets, persistent alerts and damage warnings, and mark-all-read.
- **Logbook:** a split-view editor. Drafts autosave locally until you save them to the game.
- **API console:** every documented endpoint with parameter and body forms (or raw JSON), live pickers, a JSON response viewer and *copy as cURL*. Your key is never included in the copied command.
- **Activity:** a request log with priority, status, latency and retries, plus rate-budget and link health.
- **Command palette (Ctrl/⌘K)** to jump to views, switch probes, run actions or open any endpoint. **Ctrl/⌘1–9** switches views and **Ctrl/⌘J** opens jobs.
- **Simulator mode:** a complete offline universe for trying GUPPI, demos and development. Nothing is sent to the game.

**Security** (carried over from 1.x and tightened)
- The API key lives only in the Electron main process. If you choose to remember it, it is stored encrypted with the OS keychain (`safeStorage`). The renderer never receives it.
- The main-process gateway forwards only documented endpoints to `https://neumann-probe.net`. It rejects redirects and redacts any echo of the key from responses.
- The window is sandboxed with context isolation, a strict CSP, all non-app network requests blocked and permission requests denied. External links open only for `neumann-probe.net`.

## Develop

Requires Node.js 22+ and pnpm.

```bash
cd guppi2
pnpm install
pnpm dev          # browser build at http://localhost:5173 (simulator or live via the Vite proxy)
pnpm test         # unit tests (scheduler, catalog, lattice, crafting, claims, gateway, automation)
pnpm typecheck    # renderer + Electron TypeScript
```

To run the desktop shell against the dev server:

```bash
pnpm build:electron
GUPPI_DEV_URL=http://localhost:5173 pnpm start
```

## Build the desktop app

```bash
pnpm build        # renderer → renderer/, Electron → build/electron/
pnpm start        # run the production build
pnpm package:win  # Windows installer + portable exe → release/
pnpm package:linux  # Linux AppImage → release/
```

## Publishing a release

`.github/workflows/guppi2-release.yml` builds the downloads on GitHub's own Windows and Linux machines.

- **Merging to `main` publishes automatically.** If the `version` in `guppi2/package.json` hasn't been released yet, the workflow creates tag `v<version>` and a GitHub Release with the Windows installer, the portable exe and the Linux AppImage attached.
- **To ship an update**, bump `"version"` in `guppi2/package.json` (for example `2.0.1`) in the same pull request. Merges that leave the version unchanged build the app but don't publish anything.
- **Pull requests** only check and build. Their installers are attached to the workflow run as *Artifacts*, so you can test them before merging.
- **Manual option:** **Actions → GUPPI 2 desktop build → Run workflow** (or pushing a `v*` tag) publishes or re-publishes a release on demand.

## Layout

| Path | Contents |
| --- | --- |
| `electron/` | Main process: secure gateway, keychain, window, menus |
| `src/core/` | Framework-free logic: API catalog/compiler, scheduler, transports, models, lattice maths, craft planning, claims, simulator |
| `src/state/` | Session, queries, jobs runner, built-in automations, archive, routines, settings |
| `src/components/` | UI kit, shell (sidebar, top bar, palette, jobs drawer), star map, schema forms |
| `src/views/` | One file per screen |
| `tests/` | Vitest suites |

## Data

Settings, the sector archive, bookmarks, routines and logbook drafts are stored locally in the app's storage. **Export backup** in Settings saves routines and bookmarks. Keep GUPPI open (and the PC awake) while automation runs. Stopping a job prevents future orders but does not cancel work the game has already accepted.
