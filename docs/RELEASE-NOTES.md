# Release notes

## 2.3.1 (guppi2/)

- **Fix:** clicking a sector on the star map selects it again. Since 2.3.0 the map took over the mouse as soon as you pressed, so clicks never reached the dots. It now does that only once you actually start dragging.

## 2.3.0 (guppi2/)

- **A new look.** GUPPI now follows the [Impeccable](https://github.com/pbakaus/impeccable) design guidance, recorded in `guppi2/DESIGN.md`. It uses one typeface (Mona Sans) with tabular figures, calm tinted surfaces, and one accent kept for actions and selection. Gradients, glass, glows and icon tiles are gone. Probe telemetry reads as instruments (label, value and a ticked scale), and every screen, dialog and the phone app use the same parts. Contrast, text sizes and motion meet the design's floor, as checked with Impeccable's detector.
- **Colours per probe.** In Fleet, each probe can have its own accent (six presets or any hue) and optionally tint the panels. The whole app switches to that probe's colours when you take command, and each Fleet card always shows its own probe's colours. Settings sets the default.
- **Outposts keep their crew.** A Manny partway through a load when the probe jumps is pulled back aboard, which could empty an outpost. Jumps near an active outpost now offer **Leave when crew is ready**. GUPPI holds new loads, waits until every outpost Manny is standing at the asteroid, then jumps, and the outpost keeps mining remotely. Voyages and the phone app do the same. Outposts also no longer stop when sensors go offline because the probe started moving.
- **Craft queues wait for the atomic printer.** Queues used to fail with "the atomic printer is already running a job". They now take turns on the printer, wait for it to finish, and retry an order the game refuses as busy. Manny crafts that need printer-made parts wait too. The Workshop shows whether the printer is free and how long the current job has left.
- **Build a probe.** A new Workshop tab lists every part for a standard probe or a deuterium tanker, what is aboard and what is short. It plans the sub-parts and raw materials for the rest, queues them in one click (or points you to mining what is missing), and prepares the assembly order with two empty containers.
- **More freedom on the star map.** Orbit in any direction, pan with right-drag or Shift-drag, zoom from 0.1× to 40×, fly with W A S D / Q E, double-click to centre on a sector, recentre on your probe, and go full screen. It now has perspective depth and a sector grid.
- **Repository tidy-up.** GUPPI 2 is front and centre, with new screenshots. GUPPI 1.16 moved to `legacy/guppi-1.16/` with its own README.

## 2.2.0 (guppi2/)

- **New GUPPI Mobile for iPhone.** A home-screen web app with Bridge (gauges, jump, scan, mine, refuel), Crew (orders, recall), Sector (every body with its facts, plus mine, inspect and salvage), Jobs and Comms. Sheets slide up from the bottom and respect the notch and home bar.
- **Phone remote.** Settings → Phone remote turns GUPPI on the PC into the phone's server. Scan the QR code to pair. Phone requests run through the PC's own request lane and validation, and the key stays on the PC. Mining runs and scans started on the phone run on the PC, and the phone can stop jobs and pause or resume outposts. Works on home Wi-Fi, and away from home over Tailscale. Off by default, token-protected, and locks out an address after repeated wrong codes.
- **Standalone mode.** With the PC off, GUPPI Mobile can talk to the game directly with your key. An optional free Cloudflare Worker (`relay/`) hosts the app on https and relays game calls. A workflow publishes it to Cloudflare and/or GitHub Pages when either is set up.
- **Fixes.** Fill tank is disabled when no refuel station is detected. The Workshop tank readout now uses the intended font size.

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
