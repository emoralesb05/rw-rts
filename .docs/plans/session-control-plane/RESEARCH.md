# Research — Session Control Plane

> Backs the decision. Findings labeled; each maps to a probe; each tagged
> measured / decided / asserted / build-gated.

## Findings

### H1 — Modern agent UIs model bidirectional control as events plus capabilities [probe R1 · measured]

AG-UI describes an event-based agent/frontend protocol for long-running,
streaming sessions, cancel/resume, interrupts, subagents, shared state, and
agent steering. Its capability discovery model lets a client adapt UI behavior
to the current agent instead of hardcoding assumptions. Its interrupt contract
also treats human intervention as a typed, correlated pause/resume flow.

Sources:
- <https://docs.ag-ui.com/introduction>
- <https://docs.ag-ui.com/concepts/events>
- <https://docs.ag-ui.com/concepts/capabilities>
- <https://docs.ag-ui.com/concepts/interrupts>

### H2 — Codex has the strongest existing live-control surface [probe L1 · measured]

Local Codex docs and adapter code show `codex app-server --stdio` exposes
`thread/start`, `thread/resume`, `thread/fork`, `turn/start`, `turn/steer`, and
`turn/interrupt`. `CodexAppServerClient.sendPrompt()` already steers when an
active turn id exists and starts a new turn otherwise; `interruptActiveTurn()`
sends `turn/interrupt`.

Sources:
- `.docs/providers/codex.md`
- `.docs/providers/probes/codex/codex-app-server-2026-06-25.md`
- `src/main/adapters/codex-app-server.ts`

### H3 — Claude can resume and fork, but live TUI/background control needs tighter probing [probe L2 · measured]

Claude `--resume` appends to the same session id, while `--fork-session`
branches. Current local notes also document background commands
`--bg`, `claude agents --json`, `claude attach`, `claude logs`, `claude stop`,
`claude respawn`, and remote-control commands. However, the same provider doc
records that an already-open TUI does not reactively pick up JSONL appends from
a sibling resume process.

Sources:
- `.docs/providers/claude.md`
- `.docs/providers/probes/claude/`

### H4 — Cursor and Gemini are safer as limited controls first [probe L3 · measured]

Cursor has known chat ids and can resume with `cursor-agent --print --resume`,
but IDE allowlist mode makes Realmkeeper permission responses advisory, not
authoritative. Gemini supports generated `--session-id`, `--resume`, and
`--list-sessions`, but local docs still classify OAuth/headless behavior as
account-tier uncertain. Both providers should expose clear limited controls
before stronger promises.

Sources:
- `.docs/providers/cursor.md`
- `.docs/providers/gemini.md`
- `.docs/providers/probes/cursor/`
- `.docs/providers/probes/gemini/`

### H5 — Realmkeeper already has control entry points, but not a capability model [probe L4 · measured]

`AgentManager` supports spawn, list, send, send-to-observed, and kill. IPC has
`rw:spawn-agent`, `rw:send-prompt`, `rw:kill-agent`, and `rw:list-units`.
The renderer currently gates decree/recall mostly on `spawnedHere`, while the
chat input can send to observed wielders through provider resume. This is a
good base, but it does not distinguish steer vs append-turn, fork vs resume,
provider-native attach, or observed-only limits.

Sources:
- `.docs/architecture/ipc.md`
- `src/main/agent-manager.ts`
- `src/shared/ipc.ts`
- `src/renderer/src/ui/WielderChatInput.tsx`
- `src/renderer/src/ui/floating/WielderPanelBody.tsx`

### H6 — Codex list and fork controls are now contract-proven [probe P1 · measured]

OpenAI's current Codex manual describes app-server as JSON-RPC over stdio,
websocket, or Unix socket and documents thread start/resume/fork, turn
start/steer/interrupt, and generated schema output. The installed
`codex-cli 0.142.5` generated an experimental schema that includes
`thread/list`, `thread/loaded/list`, `thread/turns/list`, `thread/read`,
`thread/fork`, `turn/steer`, and `turn/interrupt`. The same local probe found
`codex fork [SESSION_ID] [PROMPT]`, `codex resume [SESSION_ID] [PROMPT]`,
and `codex remote-control start|stop`.

The only local correction is daemon lifecycle: `codex app-server daemon` has
`start`, `stop`, `enable-remote-control`, `disable-remote-control`, and
`version`, but no `status` subcommand; `daemon version` fails cleanly when the
control socket is absent. Realmkeeper should implement list/fork through its
own app-server client instead of shelling into daemon management.

Sources:
- `.docs/plans/session-control-plane/probes/provider-native-controls-2026-07-03.md`
- <https://developers.openai.com/codex/codex-manual.md>

### H7 — Claude background discovery and attach/logs are ticketable, stop remains kind-gated [probe P1 · measured]

Claude's current CLI reference documents `claude agents --json`,
`claude agents --json --all`, `claude attach <id>`, `claude logs <id>`,
`claude stop <id>`, `claude respawn <id>`, `claude daemon status`, and
remote-control. The local `claude 2.1.200` probe confirmed those commands,
`claude auth status`, and machine-readable `agents --json --all` output with
`sessionId`, `cwd`, `kind`, `pid`, `name`, and `status`.

Realmkeeper can safely list Claude provider sessions and expose attach/logs for
sessions that Claude reports. Stop/respawn should stay unavailable unless the
reported session kind/status proves it is provider-background-managed; the
probe did not start or stop a disposable background session.

Sources:
- `.docs/plans/session-control-plane/probes/provider-native-controls-2026-07-03.md`
- <https://code.claude.com/docs/en/cli-reference>

### H8 — Cursor is authenticated for headless resume, but not authoritative IDE control [probe P1 · measured]

The installed `cursor-agent 2026.06.26-7079533` reports authenticated status,
`cursor-agent about` shows an active subscription, and `cursor-agent models`
returns a model catalog. Local help exposes `create-chat`, `resume`, `ls`, and
`models`, but neither local help nor the official docs shell fetch exposed an
IDE attach/injection or permission-control API.

Realmkeeper should keep Cursor controls to known-chat resume/send and optional
chat discovery after `cursor-agent ls` output is fixture-tested. Cursor IDE
sessions remain observe-only.

Sources:
- `.docs/plans/session-control-plane/probes/provider-native-controls-2026-07-03.md`
- <https://cursor.com/docs>

### H9 — Gemini ACP is the right future live-control path, but auth is still the blocker [probe P1 · measured]

Gemini's ACP docs describe `gemini --acp` as stdio JSON-RPC for programmatic
control and list `initialize`, `authenticate`, `newSession`, `loadSession`,
`prompt`, `cancel`, `setSessionMode`, and `unstable_setSessionModel`. Session
management docs also document `gemini --list-sessions` and session deletion.

The local `gemini 0.47.0` probe printed "No previous sessions found for this
project" for `--list-sessions`, then stderr reported `IneligibleTierError` /
`UNSUPPORTED_CLIENT` for the cached Gemini Code Assist for individuals account.
Official auth docs still recommend API key or Vertex for headless mode and
Google sign-in for eligible local accounts. ACP `cancel` is therefore a good
future live-interrupt target, but not ticketable on this machine until
headless auth is proven.

Sources:
- `.docs/plans/session-control-plane/probes/provider-native-controls-2026-07-03.md`
- <https://geminicli.com/docs/cli/acp-mode/>
- <https://geminicli.com/docs/cli/tutorials/session-management/>
- <https://geminicli.com/docs/get-started/authentication/>

### D1 — Capability-driven controls before workflow automation [probe R1/L4 · decided]

Higher-level orchestration needs reliable primitive controls. Ship the
capability registry and direct session actions first, then let run/workflow
features compose those actions.

### D2 — Next implementation should split proven and gated native controls [probe P1 · decided]

Promote Codex `thread/list`/`thread/fork` and Claude
`agents --json --all`/attach/logs into follow-up implementation. Keep Cursor
IDE attach/injection and Gemini ACP/cancel behind explicit future probes.

## Probe → finding map

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| R1 — Agent UI protocol scan | What UI/control primitives are current agent apps converging on? | H1, D1 | Network/docs only |
| L1 — Codex adapter scan | Which live Codex controls are already available? | H2 | Local repo only |
| L2 — Claude provider scan | Which Claude controls are known and which need live validation? | H3 | Local repo; live probe later |
| L3 — Cursor/Gemini provider scan | What can be exposed safely without overclaiming? | H4 | Local repo only |
| L4 — Realmkeeper control scan | What control entry points exist today? | H5, D1 | Local repo only |
| P1 — Provider-native control probe | Which fork/attach/list/interrupt controls are stable enough to ticket? | H6, H7, H8, H9, D2 | Local CLIs; docs; no model turns |

## Coverage gaps

- No disposable Claude background-control probe was run. Treat stop/respawn as
  gated until a background-owned session is started and stopped under a fixture.
- No Codex live `thread/list` or `thread/fork` request was sent to a running
  app-server in P1. The schema and docs prove shape; a mocked or local
  app-server fixture should prove runtime behavior before UI exposure.
- No Cursor IDE injection API was found in local docs or CLI help; observed IDE
  sessions remain limited by design.
- Gemini account-tier behavior remains externally dependent. ACP should wait
  for a supported API key, Vertex configuration, or eligible Google sign-in.
- Capability UI copy needs design QA once controls are implemented, because
  disabled controls must stay understandable without adding clutter.
