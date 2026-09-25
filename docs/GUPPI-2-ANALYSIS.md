# GUPPI 1.16 review and the GUPPI 2 design

This review of the 1.16.1 desktop source (`desktop/`) explains the design choices in `guppi2/`.

## What 1.16 does well

- **Secure key handling.** The renderer posts commands to a custom `neumann://cockpit/api/command` protocol that requires a per-launch bridge token. The main process attaches the key, calls only `https://neumann-probe.net` and redacts the key from responses.
- **Schema validation.** Every command is compiled against `catalog.json`, a snapshot of the 68 documented endpoints, including the FCC-lattice parity rule for sectors.
- **Safety instincts.** Timed-out mutations are not retried, and messages warn that an order "may already have been accepted". Jettison requires exact confirmation.
- **Concurrency claims.** `task-coordinator.ts` reserves Mannies, containers, asteroids and the printer so parallel automations don't collide.
- **Rich domain features.** These include recursive craft planning, remote mining outposts, queued travel with neighbour scans, logbook, SCUT and an animated adviser.
- **Wide test coverage.** 18 script suites and many desktop self-test scenarios run against simulated responses.

## Where it is fragile

| Area | Observation | Consequence |
| --- | --- | --- |
| Code shape | Most modules are written as dense single-line statements. `app/page.tsx` is 68 KB with ~260 lines, and `electron/self-test.ts` is 100 KB. | Hard to review, hard to change safely, and easy to hide bugs in. |
| One global FIFO queue | All requests, including background fleet refreshes, go through one serial FIFO queue with a fixed 1.5 s gap. | A slow fleet refresh blocks the user's own clicks. Nothing is prioritised or de-duplicated. |
| State in one component | Probe, crew, sector, jobs and settings live in `useState`/`useRef` inside the page component. | Any render error takes down the whole cockpit, including running automation. |
| Untyped data | `any` is used throughout for responses. | Shape changes in the game API become runtime crashes rather than handled gaps. |
| Offline behaviour | There is no link-health model. Repeated failures keep polling at the same rate. | Background polling floods the logs and wastes rate budget when the game is unreachable. |
| API coverage | The generic automation cockpit can call any endpoint, but many endpoints have no purpose-built UI. | Users write JSON by hand for common actions. |
| Tests | Custom `.cjs` scripts plus a Windows-only diagnostic executable. | Checks are hard to run in CI or on macOS/Linux. |
| Platform | Windows portable only. | — |

## GUPPI 2 architecture

```
renderer (sandboxed)                          main process
┌──────────────────────────────────────┐      ┌──────────────────────────┐
│ views ─ hooks (TanStack Query) ─┐    │      │ Gateway                  │
│ jobs runner ─ automations ──────┤    │ IPC  │  • key in memory/keychain│
│                                 ▼    │ ───▶ │  • documented paths only │
│ Game façade → Scheduler → Transport  │      │  • fixed host, no redirect│
│   (catalog compile, priorities,      │      │  • redact key            │
│    dedupe, 429/backoff, offline)     │      └──────────────────────────┘
└──────────────────────────────────────┘
          │ Simulator transport (offline universe) for demo/dev/tests
```

- **`core/` has no framework dependencies.** It contains the catalog compiler, scheduler, transports, defensive normalisers, lattice maths, craft planner, claims and simulator. All of it is unit-tested in Node.
- **Scheduler.** Requests are handled in priority order: user, then automation, then background. Queued identical GETs are de-duplicated. The scheduler honours `Retry-After` and `X-RateLimit-*`, retries only reads (with jittered backoff), marks a mutation with no confirmed response as *outcome unknown*, and tracks an offline state that pauses background polling.
- **First loads at user priority.** A screen's first fetch runs at user priority. Later refreshes use the background lane.
- **Jobs runner.** Every automation is a job with claims, progress, a log and a stop button. It is independent of the view tree, so a crashed screen never stops a job. A voyage holds the `helm` claim rather than the whole probe, so crafting aboard can continue during a jump.
- **Schema-driven forms.** Every Manny order, storage move and API-console request is rendered from the documented schema. Fields such as `objectId`, `containerId`, `mannyId`, `planetId` and `targetProbeId` get pickers filled with live game data.
- **Simulator.** An in-memory universe returns the same response shapes as the game. It includes probes, Mannies with timed tasks, recursive crafting, mining, movement with arrival, messages, alerts, the logbook and a rate limiter. It powers the offline demo, UI development and the automation tests.

## Carried forward from 1.x

These behaviours were kept deliberately:
- The key never enters the renderer.
- Only the fixed game host is contacted.
- Requests are validated against the catalog, including parity.
- Mutations are never blindly re-sent.
- Jettison requires a typed confirmation.
- Claims-based concurrency.
- Stopping a job does not cancel accepted work.

## Not yet ported from 1.16

These can follow in later releases:
- The animated Ackbar adviser.
- Remote mining outposts, meaning multi-sector mining with hidden containers. The primitives (detach/recover container orders) are available in Crew and the API console.
- Missile and motorised-asteroid trajectory dashboards. The endpoints work in the API console and through Manny orders.
- Migration of 1.x saved routines and system archive.
