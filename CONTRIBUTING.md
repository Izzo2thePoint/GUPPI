# Contributing to GUPPI

Thanks for helping. Bug reports with a raw API response attached, small fixes, and new automations are all welcome.

## Reporting a bug

Open an issue with the **Bug report** template. For anything involving sensors, mining or crew orders, paste the raw response from **API console** in GUPPI (your key is never included in what it shows or copies). Real response shapes are the thing most bugs come down to.

Security problems go through [SECURITY.md](SECURITY.md), not the issue tracker.

## Setting up

You need Node.js 22 or newer and pnpm 10.

```bash
cd guppi2
pnpm install --frozen-lockfile
pnpm dev:sim        # the app in a browser, offline simulator, http://localhost:5173
pnpm test           # vitest
pnpm typecheck      # renderer + Electron TypeScript
```

The simulator (`src/core/simulator/world.ts`) is a full offline game that mirrors the real response shapes. Most tests run against it, and it is the quickest way to try a change without touching your account.

## Before you open a pull request

Run the gate. It is exactly what CI runs:

```bash
pnpm typecheck && pnpm test && pnpm build
```

Then:

- Keep the change focused. One fix or one feature per pull request.
- Read `guppi2/DESIGN.md` before touching the interface. It is the design system and it lists what not to do.
- New code goes in `guppi2/`. `legacy/guppi-1.16/` stays unchanged; it is the reference for how the live game behaves.
- If you learn a new real response shape from the game, teach the simulator the same shape so tests keep exercising it.
- Add a line to `docs/RELEASE-NOTES.md` for anything a player would notice.
- Do not bump `"version"` in `guppi2/package.json` unless you mean to publish a release: merging a new version to `main` publishes one automatically.

## Where things are

| Path | What it is |
| --- | --- |
| `guppi2/src/core/` | Framework-free logic: API catalog and validation, scheduler, models, lattice maths, crafting, claims, simulator |
| `guppi2/src/state/` | Session, queries, jobs, automations, outposts, archive, settings |
| `guppi2/src/views/`, `src/components/` | Screens and the UI kit |
| `guppi2/src/mobile/` | GUPPI Mobile, the phone app |
| `guppi2/electron/` | Main process: key handling, gateway, window, phone and agent server |
| `guppi2/cli/` | The `guppi` command line and `guppi-mcp` server |
| `relay/` | Optional Cloudflare Worker |
| `CLAUDE.md` | Architecture notes and game API facts, useful for people too |

## Licence

By contributing you agree that your contribution is released under the [MIT licence](LICENSE).
