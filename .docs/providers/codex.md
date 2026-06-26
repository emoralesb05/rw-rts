# Codex (CLI: `codex`)

## Binary & install

- Binary: `codex` (verified locally 2026-06-25: `codex-cli 0.142.2`, typically `/usr/local/bin/codex` → `node_modules/@openai/codex/bin/codex.js`)
- Two surfaces: **Codex CLI** (`codex`) and **Codex Desktop / VS Code** (separate bundled binary; version may differ)
- Settings: `~/.codex/config.toml` (hooks live under `[[hooks.<EventName>]]` arrays)
- Install hooks via `installCodexHooks()` in `src/main/codex-hook-installer.ts` (uses marker block `# realmkeeper-hooks-start` … `# realmkeeper-hooks-end`)

## Hook events

PascalCase event names, matching Claude's set:

| Event | Direction | Notes |
|---|---|---|
| `SessionStart` | fire-and-forget | |
| `SessionEnd` | fire-and-forget | True session termination |
| `UserPromptSubmit` | fire-and-forget | |
| `PreToolUse` | fire-and-forget | |
| `PostToolUse` | fire-and-forget | |
| `Stop` | fire-and-forget | Per-turn (same caveat as Claude) |
| `PermissionRequest` | **bidirectional** | Same shape as Claude |

Async hooks (`async = true`) **silently skip** with a warning (`⚠ skipping async hook in /Users/ed/.codex/config.toml: async hooks are not supported yet`). Don't set them.

The hook command is `bin/realmkeeper-hook --tool codex`. The `--tool` flag tags the payload with `__rw_tool` so the bridge knows it came from Codex (vs Claude — same PascalCase event names).

## Transcript persistence

```
~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl
```

The thread-id is also the sessionId we use throughout realmkeeper.

### TWO rollout formats (version-dependent)

**Old (≤ 0.125, CLI):**
```json
{"type":"item.completed","item":{"type":"agent_message","text":"hello","id":"..."}}
```

**New (0.126+, vscode/desktop):**
```json
{"type":"response_item","payload":{"type":"message","role":"assistant",
  "content":[{"type":"output_text","text":"hello"}],"phase":"final_answer"}}
```

`src/main/adapters/codex-transcript.ts` handles both. Only emit on `phase === "final_answer"` for the new format — earlier phases are reasoning steps.

### `session_meta` shape also varies

- Old: `cwd` at top level
- New: nested under `payload.cwd`

The watcher checks both.

### SQLite state alongside JSONL

`~/.codex/state_5.sqlite` has a `threads` table with `id`, `rollout_path`, `cwd`, `source` (`cli` / `vscode` / `exec`), `cli_version`, etc. Useful for cross-referencing what's where if you ever need to debug. We don't currently watch it.

## Realmkeeper Drive Path

Realmkeeper drives Codex through `codex app-server --stdio`, not `codex exec`.

- Spawned Codex wielders: `thread/start` → `turn/start`.
- Follow-up prompts while a turn is active: `turn/steer` with the active `turnId` as `expectedTurnId`.
- Follow-up prompts when no turn is active: `turn/start` on the existing thread.
- Observed Codex sends from Realmkeeper: `thread/resume` → `turn/start`, tagged as `source: "realmkeeper"`.
- Adapter defaults: `approvalPolicy: "never"` and `sandbox: "workspace-write"` to preserve the old non-interactive workspace-edit behavior.

## 2026-06-25 CLI/config notes

Local `codex exec resume --help` confirms the legacy programmatic form is still `codex exec resume [SESSION_ID] [PROMPT]` with `--json`, `--skip-git-repo-check`, `--output-last-message`, and `--ephemeral` available. `--full-auto` is still accepted as hidden compatibility, but OpenAI's current docs steer unattended local work toward explicit `--sandbox workspace-write`. Realmkeeper no longer uses `exec` for normal Codex driving; the old JSONL normalizer remains only for legacy stream fixtures and transcript-format coverage.

OpenAI's app-server is now the primary Realmkeeper Codex surface:

- `codex app-server` speaks JSON-RPC over stdio, websocket, or Unix socket.
- It exposes `thread/start`, `thread/resume`, `thread/fork`, `turn/start`, streamed turn notifications, `turn/interrupt`, and `turn/steer`.
- `turn/steer` maps cleanly to "interject from Realmkeeper while a turn is running." The old `exec resume` path could only append another turn.

App-server can send server-side approval and tool requests to the client (`item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, MCP elicitations, dynamic tool calls). Realmkeeper maps command, file-change, permission-profile, and legacy exec/patch approvals into normal permission cards. Structured `item/tool/requestUserInput` prompts and typed MCP elicitation `form` mode render as answer letters. MCP URL/openai-form modes and dynamic tool calls still fail closed until Realmkeeper has first-class UI for those request shapes.

OpenAI's current Codex config reference exposes granular approval knobs beyond the older global modes:

- `approval_policy` now covers categories such as sandbox approvals, rules, MCP elicitations, permission requests, and skill approvals.
- Plugin-provided MCP servers can set default approval behavior, enabled/disabled tools, and per-tool approval modes under `plugins.<plugin>.mcp_servers.<server>.*`.
- Admin-managed requirements can pin plugin and workspace-dependency availability.

Near-term leverage: map Realmkeeper's permission model onto Codex's specific approval categories instead of treating all Codex asks as one generic `PermissionRequest`, and surface plugin/MCP approval context when a Codex tool call originates from a plugin-provided server.

## MCP, plugins, project trust (we observe, don't drive)

- **MCP-provided tools** appear as normal `tool_use` events. No special handling — same path as built-in tools.
- **Plugins / marketplaces** (`[plugins."<name>"]` in config.toml) install their own command handlers. We don't introspect them — sessions using plugin tools just emit normal hook events for the underlying calls.
- **`[projects."<path>"] trust_level = "trusted"`** entries in config.toml control which repos Codex auto-trusts. Doesn't affect our hook flow but worth knowing exists if a user reports "Codex is asking permission for everything in this repo" — the answer is to add a project trust entry.
- **`mcp-server` and `app-server` subcommands.** Codex can run as an MCP server itself, or as a local app server that clients connect to with `codex --remote ...`. Realmkeeper consumes app-server directly over stdio for Codex-owned turns.

## Gaps & quirks

- **Legacy `exec resume` misleading log**: `ERROR codex_core::session: failed to record rollout items: thread <id> not found`. Despite the message, content IS persisted. This should not appear on the app-server path.
- **Live GUI (Desktop / VS Code) doesn't reactively pick up JSONL appends from sibling processes.** Same as Claude TUI: read-once on session load.
- **Version drift between CLI and Desktop.** Desktop ships a bundled binary (e.g. `0.126.0-alpha.8`) that may be ahead of the user's installed CLI (`codex --version`). Hook & rollout formats differ across versions. Handle both.
- **`async = true` hooks silently skipped.** No-op with a warning to stderr.
- **No `assistant_text` hook.** Same gap as Claude → handled by transcript watcher.
- **Legacy `exec resume` writes both old AND new format event types into the file** (event_msg + response_item duplicating content). The watcher only emits assistant_text from one path (response_item / final_answer) to avoid double-render.
