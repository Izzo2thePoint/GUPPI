# guppi-cli

Command line (`guppi`) and Model Context Protocol server (`guppi-mcp`) for [GUPPI](https://github.com/Izzo2thePoint/GUPPI), the mission-control app for the game Neumann Probe. Lets scripts and AI agents read the fleet and give orders through GUPPI's safety rails: validated against the game's API, rate-limit aware, never re-sent blindly, and your key stays on the PC.

```sh
npm install -g guppi-cli-<version>.tgz        # from a GUPPI release
guppi pair "http://<pc>:47811/#pair=TOKEN"   # Settings → Phone & agent access → Copy
guppi state
guppi jump 4 2 0
```

Add `guppi-mcp` to Claude Desktop, Claude Code or Cursor as an MCP server (Settings → Phone & agent access has the snippet). Node 22 or newer, no dependencies.

Full guide: [docs/AGENT-API.md](https://github.com/Izzo2thePoint/GUPPI/blob/main/docs/AGENT-API.md).
