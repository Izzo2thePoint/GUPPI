# Security policy

GUPPI handles your personal Neumann Probe API key, so security reports get priority over everything else.

## Reporting a vulnerability

Please **do not open a public issue** for anything that could expose a player's key, let a third party control a probe, or run code on a player's PC.

Report it privately through GitHub: **[Report a vulnerability](https://github.com/Izzo2thePoint/GUPPI/security/advisories/new)** (Security tab → Advisories → New draft). Include what you found, how to reproduce it, and which version you tested. You will get a reply as soon as possible; GUPPI is maintained in spare time, so please allow a few days.

If the report is confirmed, a fix is released as a new version and the advisory is published with credit to you, unless you prefer not to be named.

## Supported versions

Only the **latest release** on the [Releases page](https://github.com/Izzo2thePoint/GUPPI/releases/latest) receives fixes. GUPPI 1.16 in `legacy/` is kept for reference and is not maintained.

## What GUPPI promises

- Your API key lives only in the desktop app's main process. If you choose to remember it, it is stored encrypted with the operating system's keychain. The interface, the phone app and AI agents never receive it.
- The app talks only to `neumann-probe.net` and, when you click **Check for updates**, to GitHub's release API. There is no telemetry.
- Every request is validated against the game's documented API before it is sent, and mutations are never re-sent blindly.
- Phone and agent access is off by default, needs a pairing token, locks out repeated bad attempts, and can be revoked with **Unpair all phones**.
- Every release is built by GitHub Actions from the tagged commit, and each release lists SHA-256 checksums of its files.

Anything that breaks one of these promises is in scope. So is anything in `relay/` (the optional Cloudflare Worker) and in `guppi2/cli/` (the command line and MCP server).

## Out of scope

- Bugs in the Neumann Probe game or its API. Report those to the game's authors.
- Issues that need physical access to an unlocked PC, or malware already running on it.
- Using the phone remote over an untrusted network without Tailscale or a similar tunnel. The README says the local link is plain HTTP.
