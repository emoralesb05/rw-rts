# Codex app-server hardening probes

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| [codex-app-server-2026-06-25.md](codex-app-server-2026-06-25.md) | What does the installed app-server protocol expose? | `thread/start`, `thread/resume`, `turn/start`, `turn/steer`, approvals, user input, MCP elicitations, and dynamic tool calls are present. | No |
| [codex-input-letters-smoke-2026-06-26.md](codex-input-letters-smoke-2026-06-26.md) | Can Realmkeeper render structured Codex user-input requests as answer letters? | Structured request fixtures render and answer through the shared user-input bridge. | No |
| [codex-app-server-live-probe-2026-06-26.md](codex-app-server-live-probe-2026-06-26.md) | Does a live app-server turn complete a command approval round trip? | Live Codex emitted one command approval and accepted the allow-listed `printf realmkeeper-live-probe` command. | Codex auth/network |

## Runners

- [codex-app-server-live-probe-2026-06-26.mjs](codex-app-server-live-probe-2026-06-26.mjs)
