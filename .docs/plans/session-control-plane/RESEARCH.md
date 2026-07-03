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

### D1 — Capability-driven controls before workflow automation [probe R1/L4 · decided]

Higher-level orchestration needs reliable primitive controls. Ship the
capability registry and direct session actions first, then let run/workflow
features compose those actions.

## Probe → finding map

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| R1 — Agent UI protocol scan | What UI/control primitives are current agent apps converging on? | H1, D1 | Network/docs only |
| L1 — Codex adapter scan | Which live Codex controls are already available? | H2 | Local repo only |
| L2 — Claude provider scan | Which Claude controls are known and which need live validation? | H3 | Local repo; live probe later |
| L3 — Cursor/Gemini provider scan | What can be exposed safely without overclaiming? | H4 | Local repo only |
| L4 — Realmkeeper control scan | What control entry points exist today? | H5, D1 | Local repo only |

## Coverage gaps

- No new live Claude background-control probe was run for this plan. Treat
  background stop/attach/logs as build-gated until probed.
- No Cursor IDE injection API was found in local docs; observed IDE sessions
  remain limited by design.
- Gemini account-tier behavior remains externally dependent. The plan only
  requires accurate diagnostics and safe fallback behavior.
- Capability UI copy needs design QA once controls are implemented, because
  disabled controls must stay understandable without adding clutter.
