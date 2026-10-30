# Release notes

## 2.8.0 (guppi2/)

Ready for the public: this release is about trust and upkeep rather than new game features.

- **Check for updates.** Settings → **Updates** and Help → **Check for updates…** ask GitHub for the latest release and open the download page. Only when you click: GUPPI never checks on its own and never updates itself.
- **Listen on.** Phone & agent access can now listen on one address instead of every network the PC is on: your Tailscale address only, or this PC only for the command line and MCP server.
- **Verified downloads.** Every release now carries `SHA256SUMS.txt` and lists the hashes in its notes. The workflow signs the Windows builds automatically once signing credentials are added as repository secrets (see the GUPPI 2 README).
- **Hardened build.** Electron 45 with the latest security fixes, and Electron fuses that turn off `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect`, and load code only from the integrity-checked `app.asar`. GUPPI Mobile's Content Security Policy is now also embedded in the page, so GitHub Pages enforces it too. GitHub Actions are pinned to commit hashes, Dependabot keeps dependencies current, and CI fails on a production-dependency advisory.
- **House rules.** New `SECURITY.md` (how to report a vulnerability privately), `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`, a privacy note in both READMEs saying exactly what GUPPI stores and sends, the Linux FUSE requirement spelled out, and a reminder to lock the Cloudflare relay to your own pages before sharing its address.

## 2.7.0 (guppi2/)

- **GUPPI for scripts and AI agents.** Nothing is built in, but anything can now plug in. The desktop app gains a local **Agent API** on the remote-access port (`/api/v1/…`, with an OpenAPI document and a live event stream), a zero-dependency **`guppi` command line** (`guppi state`, `guppi sector`, `guppi jump 4 2 0`, `guppi mine …`, `guppi events --follow`, `--json` for machines) and a **`guppi-mcp` server** that exposes every verb as a Model Context Protocol tool for Claude Desktop, Claude Code, Cursor and other MCP clients. Every call runs through GUPPI's own request lane below your clicks, is validated against the game's documented API, is never re-sent blindly, and shows in Activity under the agent's name. Your key never leaves the PC. See [docs/AGENT-API.md](AGENT-API.md).
- **Scopes and a safety catch.** Settings → **Phone & agent access** (the former Phone remote card) chooses **Off**, **Read-only** or **Control** for agents, and a separate **Allow dangerous actions** switch guards firing missiles, jettison, assembling a probe, detaching or dropping containers and asteroid launches. Off, an agent is told to ask you. The card shows the pairing command and a ready-made MCP configuration to copy.
- **Releases** now include `guppi-cli-<version>.tgz` for `npm install -g`.
- **Fix:** the outpost square on the star map no longer survives clearing the sector archive. Finished outposts are hidden from the map, and **Clear** in Settings → Local data forgets them too.

## 2.6.0 (guppi2/)

- **New Tactical screen** (Command → Tactical). **Contacts** lists every other ship the sensors report in your sector, tells your own probes from other players' and Others craft, and shows who each one is firing at and how many missiles are aimed at it. **Missiles in flight** follows every missile from launch to impact with launcher, target and time to impact; the ones aimed at you are marked and the screen polls faster while you are under fire. **Fire control** lets you pick a target from Contacts (or any object in the sector), a Manny and a missile, then fires after a confirmation; **Your launches** follows each missile you fired through preparation, flight and impact. A **Combat log** gathers impact and destroyed-probe alerts.
- **Bridge warning.** When a missile is inbound the Bridge shows a red strip with the launcher and time to impact, and a button straight to Tactical.
- **Simulator.** The home sector now has a hostile Others sentinel that fires on parked probes (and sometimes on a rival probe), two missiles aboard Bob, and working `ignite_missile` and missile tracking, so Tactical can be tried offline.

## 2.5.0 (guppi2/)

- **One sector per jump.** GUPPI used to send a far destination to the game as a single move, so a probe five sectors away jumped the whole way in one go. Every jump is now limited to **Sectors per jump** (Helm and Settings, default 1): a longer trip is flown as a series of jumps along the lattice, each at most that many sectors, with the probe stopping between them. This applies to single jumps, managed voyages, **Leave when crew is ready** and the phone's jump sheet. The Helm shows the hop count and how many jumps it will take, the star map draws the legs it will actually fly, and the confirmation says so before you engage.

## 2.4.0 (guppi2/)

- **The star map shows what you know.** Every sector reading now lands in the archive, not only explicit scans: the local sector whenever a probe looks at it, voyage arrivals and outpost observations. Dots are coloured by what matters most: hazards (red), habitable worlds (green), star systems (yellow), asteroid fields and scanned empty space (grey), with hollow dots for passive estimates from outside SCUT coverage. A dotted ring marks SCUT coverage, a square marks one of your outposts, a small tick marks a deuterium refuel station, and the home sector carries a cross. Hovering a dot shows a readout: systems, planets, asteroids, inhabited and mineable bodies, resources, risk, and the probes, outposts and bookmarks there. System names appear when you zoom in. The hazard rule is the one GUPPI 1 used against the live game (black holes, extreme bodies, high or extreme risk readings), and a passive estimate never overwrites a real scan.
- **Every probe on the map.** Probes under way are drawn moving along their jump line with an arrow and an ETA instead of disappearing until they arrive. Positions come from each probe's own telemetry, so a probe the fleet list reports without a position still shows, and a probe sitting on a sector keeps that sector's colour as a halo. Each marker uses its probe's own colours from Fleet. Fleet cards and the table have a **Map** button that opens Navigation targeted on that probe.
- **Target readout.** The sector card in Navigation now shows SCUT coverage, refuel stations, inhabited and mineable counts and risk, and offers **Observe again** for estimates. Arriving from a voyage refreshes the visited list straight away.
- **Releases no longer depend on Actions artifact storage.** Installers are uploaded straight onto a draft release and it is published once every platform has delivered. Pull-request builds still attach installers as artifacts when the account has storage left, and pass either way.

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
