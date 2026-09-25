# Release notes

## 2.0.0 (guppi2/)

- Complete rebuild in `guppi2/`, alongside 1.16.1. See `docs/GUPPI-2-ANALYSIS.md`.
- One request lane ordered by priority (user, then automation, then background). Queued duplicate reads are merged. Retry-After and rate-limit headers are honoured. Reads retry with backoff. Mutations are never re-sent without confirmation. Background polling pauses while the game is offline.
- New screens: Bridge, Fleet, Navigation (3D star map, voyages, sweeps, bookmarks), Crew (every Manny order, batch assignment), Inventory (moves, routing rules, jettison), Workshop (have/need planning, parallel craft queues, upgrades, repairs, fuel), Automation (mining runs, routine builder with dry run), Comms, Logbook (autosaved drafts), API console (all 68 endpoints), Activity and Settings.
- Command palette, keyboard shortcuts, desktop notifications and a frameless window.
- The API key can be kept in the OS keychain. The gateway accepts only documented endpoints.
- An offline simulator universe for demos, development and tests.
- 36 unit tests across the scheduler, catalog, lattice, crafting, claims, gateway and automation.

## 1.16.1

- Doubled the adviser portrait from 88 × 88 to 176 × 176 pixels.
- Separated facial animation from the resting body and hands.
- Replaced repeated waving and rocking with a subtle breathing movement.
- Passed 33 isolated desktop checks and both TypeScript configurations; visually checked both talking frames and layouts at 1540px and 980px.

## 1.16.0

- Added the Ackbar adviser between probe telemetry and speed.
- Added contextual tips, NASA-sourced universe facts and reports based on the selected probe's latest loaded data.
- Added quiet mode, hiding/restoring, animation controls and reduced-motion support.
- Passed 18 regression suites and 32 isolated desktop checks.

## 1.15.1

- Reliability review covering concurrency, navigation, mining, inventory, desktop recovery and API handling.
- Corrected probe rename responses while preserving detailed telemetry.
- Preserved exact jettison confirmations and unsaved rename/logbook drafts across refreshes.
- Verified accepted mining amounts and resources before issuing further loads.
- Improved cancellation, telemetry validation, rate-limit handling and malformed settings recovery.
- Preserved the documented Engineering `includeAll=1` query.
- Passed 18 regression suites and 238 desktop scenario checks, including shared startup checks.

These tests used simulated game responses and did not perform live game mutations. They do not guarantee the absence of every bug.
