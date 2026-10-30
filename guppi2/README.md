# GUPPI 2

A ground-up rebuild of GUPPI, the desktop mission-control companion for [Neumann Probe](https://neumann-probe.net/). Same secure desktop model as 1.x, with a sturdier request engine, broader API coverage, safer automation and a new interface.

![GUPPI 2 Bridge](../docs/screenshots/guppi2-bridge.png)

> GUPPI 1.16 lives unchanged in [`../legacy/guppi-1.16`](../legacy/guppi-1.16). See [`../docs/GUPPI-2-ANALYSIS.md`](../docs/GUPPI-2-ANALYSIS.md) for the review of 1.x that shaped this version, and [`DESIGN.md`](DESIGN.md) for the design system.

## Download

Get the latest version from the **[Releases page](https://github.com/Izzo2thePoint/GUPPI/releases/latest)**:

- **Windows:** `GUPPI-Setup-<version>.exe` is the installer and adds Start-menu and desktop shortcuts. `GUPPI-Portable-<version>.exe` runs without installing.
- **Linux:** `GUPPI-<version>-x86_64.AppImage`. Make it executable with `chmod +x`, then run it. AppImages need FUSE: on Ubuntu and Debian `sudo apt install libfuse2`, or run it with `--appimage-extract-and-run`.
- **Checksums:** every release carries `SHA256SUMS.txt` and lists the same hashes at the end of its notes. Check a download with `sha256sum -c SHA256SUMS.txt` on Linux or `certutil -hashfile GUPPI-Setup-<version>.exe SHA256` on Windows.

If Windows SmartScreen warns you, click **More info → Run anyway**. Releases are built by GitHub Actions from the tagged commit; see [Publishing a release](#publishing-a-release) for code signing.

## GUPPI Mobile (iPhone and Android)

GUPPI Mobile is a home-screen web app for iPhone and Android. Nothing to install from an app store. It works two ways.

**Control GUPPI on your PC (recommended)**

1. In GUPPI on the PC, open **Settings → Phone & agent access** and switch on remote access. The first time, Windows asks whether GUPPI may use the network: allow **Private networks**.
2. With the phone on the same Wi-Fi, point its camera at the QR code and tap the link. GUPPI Mobile opens in the browser and pairs.
3. Add it to the home screen: in Safari tap **Share → Add to Home Screen**; in Chrome on Android tap the menu → **Add to Home screen** (or **Install app**).

The phone sends everything through GUPPI on the PC: the same request lane, rate limiting and validation. Your game key never leaves the PC, and jobs and outposts keep running there while the phone sleeps. GUPPI must be open on the PC and connected to the game.

- **Away from home:** install [Tailscale](https://tailscale.com/) (free) on the PC and the phone, set **Listen on** to the `100.x` address in the Phone & agent access card, and scan again. The server is then reachable only through Tailscale, which also encrypts the link.
- **On your home network the link is plain HTTP**, so use it on networks you trust. **Listen on** limits the server to one address (or to this PC only, for the command line and MCP server). The pairing link works like a password: **Unpair all phones** issues a new one. Ten wrong codes in ten minutes lock that address out for a while.
- **Only enter your key into a copy of GUPPI Mobile that your own PC serves or that you host yourself.** Whoever hosts the page could change it.

**Standalone (PC off)**

Choose **Direct** and enter your API key. The phone then talks to the game itself. Automations started this way only run while GUPPI Mobile is open on screen, because iOS pauses web apps in the background. Standalone needs the app hosted on `https://`:

- **Cloudflare (free, recommended):** see [`../relay/README.md`](../relay/README.md). One Worker serves GUPPI Mobile and relays game calls, so it works whether or not the game accepts browser connections.
- **GitHub Pages:** set **Settings → Pages → Source** to **GitHub Actions**. The *GUPPI Mobile web app* workflow then publishes on every merge. Pages needs a public repository or a paid GitHub plan. If **Direct** can't reach the game from Pages, add the relay (**Direct → Use a relay**).

## Scripts and AI agents

GUPPI exposes a local **Agent API** on the remote-access port, a **`guppi` command line** and a **`guppi-mcp`** Model Context Protocol server, so scripts and AI tools (Claude Desktop, Claude Code, Cursor, your own bots) can read the fleet and give orders through GUPPI's safety rails. Turn it on in **Settings → Phone & agent access** (scope Read-only or Control; dangerous actions off by default), then:

```sh
npm install -g guppi-cli-<version>.tgz        # from a release, or: npm install -g ./cli
guppi pair "http://<pc>:47811/#pair=TOKEN"   # the card has a Copy button for this
guppi state
```

The full guide, including the MCP configuration and every verb, is [`../docs/AGENT-API.md`](../docs/AGENT-API.md). The verb table is [`cli/verbs.json`](cli/verbs.json); `tests/agent-api.test.ts` drives the API, the CLI and the MCP server.

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
- **Bridge:** the probe in command with instrument readouts for hull, deuterium, cargo and crew, live jump progress with ETA, crew activity, local sector contacts, alerts and resources.
- **Fleet:** every probe in a grid or table view, with live telemetry, crew readiness and hop distance. **Each probe can have its own colour theme** (Fleet → Colours): six accents or a custom hue, optionally tinting the panels. The app wears the theme of the probe you command. Take command of any probe with one click.
- **Navigation:** a 3D star map showing visited sectors, archived scans, bookmarks, fleet positions and active jumps. Drag to orbit in any direction, right-drag or Shift-drag to pan, scroll to zoom (0.1×–40×), W A S D / Q E to fly across the lattice, double-click to centre on a sector, and switch to full screen. It includes a jump planner with parity validation and hop counts, 12-neighbour sweeps, a local sector object tree with a raw-data inspector, and contextual Manny orders.
- **SCUT:** coverage, networks and relays. Switch on relays and install transit beacons.
- **Outposts:** remote mining that keeps running after you jump away, over SCUT. Jumps wait until the outpost crew is standing at the asteroid (**Leave when crew is ready**), so the crew stays behind instead of being pulled back aboard.
- **Crew:** Manny cards with task progress and countdowns. Every documented Manny order is available through a schema-driven form whose pickers use live data. You can assign one order to several Mannies at once through the atomic batch endpoint. Rename and recall are included.
- **Inventory:** container capacity strip, per-container resources, grouped parts, storage moves, a routing-rules editor and reservation reassignment. Jettison requires typing a confirmation phrase.
- **Workshop:** recipes show have/need per ingredient, what will be prepared first, and what is missing. You can craft now or queue ×N in parallel across idle Mannies. Queues take turns on the atomic printer instead of failing while it is busy. **Build a probe** lists every part for a standard probe or deuterium tanker against what is aboard, plans the sub-parts and raw materials for the rest, queues them in one click, and prepares the assembly order. Also covers probe upgrades, repairs and deuterium refills.
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
- The phone remote is off until you switch it on. Every call needs the pairing token (compared in constant time). The PC maps each phone request back to a documented operation (`parseWire`) and validates it before sending. Phone pages are served with a CSP that allows connections only to the PC.

## Develop

Requires Node.js 22+ and pnpm.

```bash
cd guppi2
pnpm install
pnpm dev          # browser build at http://localhost:5173 (simulator or live via the Vite proxy)
pnpm dev:sim      # the same, opening straight into the simulator (or add ?simulator to the URL)
                  # GUPPI Mobile: http://localhost:5173/mobile.html (use a phone-sized window)
pnpm test         # unit tests (scheduler, catalog, lattice, crafting, claims, gateway, automation, outposts, probe assembly, phone remote, relay)
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
- **Pull requests** only check and build. Their installers are attached to the workflow run as *Artifacts* when the account has artifact storage left (running out of it doesn't fail the build), so you can test them before merging. Releases don't use artifact storage at all: each platform uploads its installers straight onto a draft release, which is published once every file is there.
- **Manual option:** **Actions → GUPPI 2 desktop build → Run workflow** (or pushing a `v*` tag) publishes or re-publishes a release on demand.
- **Checksums:** the publish step downloads every file, writes `SHA256SUMS.txt` onto the release and appends the hashes to the notes.
- **Hardening:** the app ships with Electron fuses that turn off `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect`, load code only from the integrity-checked `app.asar`, and give `file://` pages no extra privileges. Actions are pinned to commit hashes and Dependabot proposes updates.

### Code signing (optional)

Unsigned builds work but trip SmartScreen on first run. Signing switches on by itself when the right repository secrets exist (**Settings → Secrets and variables → Actions**); the workflow prints which it used.

- **Azure Trusted Signing** (about US$10 a month, no certificate to handle): create a Trusted Signing account and certificate profile in the Azure portal, an app registration with a client secret that has the *Trusted Signing Certificate Profile Signer* role, then add `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SIGNING_ENDPOINT` (for example `https://eus.codesigning.azure.net`), `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE` and `AZURE_SIGNING_PUBLISHER` (the certificate subject, such as `CN=Your Name`).
- **A code-signing certificate** from any CA: export it as a `.pfx`, base64-encode the file (`base64 -w0 cert.pfx`) into `WIN_CSC_LINK`, and put its password in `WIN_CSC_KEY_PASSWORD`. An EV certificate gives SmartScreen reputation immediately; a standard one earns it over time.

Linux AppImages are not signed; the checksums cover them.

## Layout

| Path | Contents |
| --- | --- |
| `electron/` | Main process: secure gateway, keychain, window, menus, phone remote server |
| `cli` | The `guppi` command line and `guppi-mcp` server (plain Node, no dependencies) |
| `src/core/` | Framework-free logic: API catalog/compiler, scheduler, transports, models, lattice maths, craft planning, claims, simulator |
| `src/state/` | Session, queries, jobs runner, built-in automations, archive, routines, settings |
| `src/components/` | UI kit, shell (sidebar, top bar, palette, jobs drawer), star map, schema forms |
| `src/views/` | One file per screen |
| `src/mobile/` | GUPPI Mobile (`mobile.html`): phone screens and connection handling |
| `../relay/` | Optional Cloudflare Worker that hosts GUPPI Mobile and relays game calls |
| `tests/` | Vitest suites |

## Data and privacy

GUPPI has no telemetry, analytics or crash reporting. The desktop app talks only to `neumann-probe.net`, plus GitHub's release API when you click **Check for updates** (Settings, or Help → Check for updates…). Nothing runs on a schedule and the app never updates itself.

Everything it keeps is on your PC, in the app's data folder:

| What | Where |
| --- | --- |
| Your API key, only if you tick **Remember** | `credentials.bin`, encrypted with the OS keychain (`safeStorage`); **Disconnect → forget** deletes it |
| Phone and agent access settings and the pairing token | `remote.json`, readable by your user only; **Unpair all phones** replaces the token |
| Settings, sector archive, bookmarks, routines, outposts, logbook drafts, probe colours | the app's local storage; **Settings → Local data** clears them |

**Export backup** in Settings saves routines and bookmarks. Keep GUPPI open (and the PC awake) while automation runs. Stopping a job prevents future orders but does not cancel work the game has already accepted.

GUPPI Mobile keeps its connection in the phone browser's storage when **Remember** is on. In Direct mode that includes your key, so switch Remember off on a shared phone, or use **Forget** on the connect screen. Security reports: see [`../SECURITY.md`](../SECURITY.md).
