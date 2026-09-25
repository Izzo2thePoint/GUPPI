# GUPPI

A Windows desktop mission-control companion for [Neumann Probe](https://neumann-probe.net/), built with Electron, React and TypeScript.

Current version: **1.16.1**.

> **GUPPI 2 is here.** [`guppi2/`](guppi2/) is a ground-up rebuild. It adds a priority request engine that is aware of rate limits, coverage of every API endpoint, safer automation and a new interface. It also includes an offline simulator. See [`guppi2/README.md`](guppi2/README.md) and the [design review](docs/GUPPI-2-ANALYSIS.md). The 1.x source below is unchanged.

## Features

- Fleet overview and individual probe controls.
- Sensors, a 3D system map, saved scans, bookmarks and route planning.
- Queued travel with crew checks and optional scans of all twelve neighboring sectors.
- Mining plans, per-Manny cargo limits, asteroid containers and remote mining outposts.
- Inventory rules, container transfers and cargo jettison.
- Crafting queues, repeat conditions and prerequisite crafting using existing parts first.
- Probe construction, repairs, blueprint upgrades and asteroid operations.
- Concurrent work with shared-resource checks and targeted Manny recall.
- SCUT, messages, alerts and the game's Logbook.
- An animated Ackbar adviser with contextual tips, sourced facts and optional chatter.

## Run the Windows program

Use the portable executable supplied with a release. Close any previous GUPPI instance before opening a newer version. Connect using your personal game API key.

The key is held in memory. Saved systems, bookmarks, queues and settings use the existing `Neumann Mission Cockpit` application-data folder. Keep GUPPI open and the PC awake for local automation. Stopping future orders does not cancel work already accepted by the game.

## Build from source

Use Windows, Node.js 22.12 or newer, and pnpm. The checked-in lockfile pins the dependency graph; `pnpm-workspace.yaml` specifies permitted dependency build scripts.

```powershell
cd desktop
pnpm install --frozen-lockfile
pnpm run build
pnpm start
```

Create the Windows portable executable:

```powershell
pnpm run package -- --build-run=local
```

Alternatively, after building:

```powershell
node scripts/package.cjs --build-run=local
```

The output is `desktop/release/GUPPI.exe`. Use a fresh build-run name if a previous diagnostic or packaging directory is locked by a running process.

## Validate changes

From `desktop`:

```powershell
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.electron.json --noEmit
Get-ChildItem scripts/test-*.cjs | ForEach-Object {
    node $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
}
```

Desktop checks run against simulated game responses in isolated profiles. Build first, then prepare a diagnostic executable:

```powershell
node scripts/prepare-diagnostic.cjs --test-run=adviser-check --adviser-check
```

Run `work/desktop-diagnostic-adviser-check/GUPPI.exe` from the repository root. Its results appear in `work/desktop-adviser-test-adviser-check.json`. Other supported scenarios include `--bridge-check`, `--operations-check`, `--inventory-check`, `--utility-check`, `--fleet-check` and `--outpost-check`.

## Repository layout

| Location | Contents |
| --- | --- |
| `desktop/src` | Interface, game commands and automation logic |
| `desktop/electron` | Desktop shell, API bridge and test fixtures |
| `desktop/public` | Bundled artwork and static assets |
| `desktop/scripts` | Build, packaging and regression checks |
| `docs` | Release notes and artwork reference |

Generated executables, installed dependencies, local diagnostic data and intermediate work are excluded from source control. The executable belongs in a release download rather than Git history.

GUPPI is an independent companion. Game rules and API availability are controlled by Neumann Probe. The application's dependency notices are generated during the build. Character artwork and third-party assets are not represented as original intellectual property of this project.
