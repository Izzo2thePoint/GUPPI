# Release notes

## 2.1.0 (guppi2/)

- **Sensors show everything.** Solar systems now list their planets, moons and belts, which the game reports under `minableTargets` and `bookmarkTargets`. Each body shows its reported facts and effects, such as radiation, flare activity, habitability, atmosphere and hazards. The inspect dialog has a full readout and a raw JSON view, and a sector summary shows data freshness, SCUT coverage, networks, navigational risk, mineable count, relays and refuel stations.
- **Mining works on real targets.** Mining lists every body the game allows, including nested planets and moons, and offers only resources that aren't exhausted. Mining runs split the amount into 0.05 ECE loads across several Mannies and can deliver into detached containers.
- **Refuelling.** The Fill tank button works at deuterium refuel stations. You can also refuel by mining deuterium, which goes straight into the tank at 0.01 ECE per point.
- **New SCUT screen.** Shows coverage and networks, including relays, covered sectors and member probes. Mannies can switch on relays and install transit beacons, and Mannies working in other sectors are listed.
- **New mining outposts.** A container is hidden on an asteroid, Mannies are stationed there, and GUPPI keeps ordering loads after you leave while the probe and outpost share SCUT coverage. Outposts wait when out of contact, hand a departed Manny's share to the crew still at the asteroid, and resume after a restart. You can recover the container and recall the crew. Ported from 1.16's remote mining.
- **Fixes.** Chip selectors in dialogs could flip the wrong choice. Dialogs could open before sensor data arrived and show no targets. An outpost could misread its sector during a jump. Order pickers now match each action.

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
