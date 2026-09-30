# GUPPI 1.16 (legacy)

The original GUPPI: a Windows mission-control companion for [Neumann Probe](https://neumann-probe.net/), built with Electron, React and TypeScript. It is kept here unchanged for reference. **New work happens in [GUPPI 2](../../guppi2/)**, and downloads are on the [Releases page](https://github.com/Izzo2thePoint/GUPPI/releases/latest).

GUPPI 1.16 was built and tested against the live game, so its code is the reference for real response shapes and game rules. The design review that shaped GUPPI 2 is in [`docs/GUPPI-2-ANALYSIS.md`](../../docs/GUPPI-2-ANALYSIS.md).

## Features

- Fleet overview and individual probe controls.
- Sensors, a 3D system map, saved scans, bookmarks and route planning.
- Queued travel with crew checks and optional scans of all twelve neighbouring sectors.
- Mining plans, per-Manny cargo limits, asteroid containers and remote mining outposts.
- Inventory rules, container transfers and cargo jettison.
- Crafting queues, repeat conditions and prerequisite crafting using existing parts first.
- Probe construction, repairs, blueprint upgrades and asteroid operations.
- Concurrent work with shared-resource checks and targeted Manny recall.
- SCUT, messages, alerts and the game's Logbook.
- An animated Ackbar adviser with contextual tips, sourced facts and optional chatter.

## Run it

Use the portable executable from the `v1.16.1` release. Close any previous GUPPI instance before opening a newer version, then connect with your personal game API key.

The key is held in memory. Saved systems, bookmarks, queues and settings live in the `Neumann Mission Cockpit` application-data folder. Keep GUPPI open and the PC awake for local automation. Stopping future orders does not cancel work the game has already accepted.

## Build from source

You need Windows, Node.js 22.12 or newer, and pnpm. The checked-in lockfile pins the dependency graph, and `pnpm-workspace.yaml` lists the dependency build scripts that are allowed to run.

```powershell
cd legacy/guppi-1.16
pnpm install --frozen-lockfile
pnpm run build
pnpm start
```

To build the Windows portable executable:

```powershell
pnpm run package -- --build-run=local
```

or, after building, `node scripts/package.cjs --build-run=local`. The output is `release/GUPPI.exe`. Use a fresh build-run name if a previous diagnostic or packaging folder is locked by a running process.

## Validate changes

From `legacy/guppi-1.16`:

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

Run `legacy/work/desktop-diagnostic-adviser-check/GUPPI.exe`. Its results appear in `legacy/work/desktop-adviser-test-adviser-check.json`. The other scenarios are `--bridge-check`, `--operations-check`, `--inventory-check`, `--utility-check`, `--fleet-check` and `--outpost-check`.

## Layout

| Location | Contents |
| --- | --- |
| `src` | Interface, game commands and automation logic |
| `electron` | Desktop shell, API bridge and test fixtures |
| `public` | Bundled artwork and static assets |
| `scripts` | Build, packaging and regression checks |

Character artwork and third-party assets are not represented as original intellectual property of this project.
