# Codex (CLI: `codex`)

## Binary & install

- Binary: `codex` (typically `/usr/local/bin/codex` → `node_modules/@openai/codex/bin/codex.js`)
- Two surfaces: **Codex CLI** (`codex`) and **Codex Desktop / VS Code** (separate bundled binary; version may differ)
- Settings: `~/.codex/config.toml` (hooks live under `[[hooks.<EventName>]]` arrays)
- Install hooks via `installCodexHooks()` in `src/main/codex-hook-installer.ts` (uses marker block `# kh-rts-hooks-start` … `# kh-rts-hooks-end`)

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

The hook command is `bin/kh-rts-hook --tool codex`. The `--tool` flag tags the payload with `__kh_tool` so the bridge knows it came from Codex (vs Claude — same PascalCase event names).

## Transcript persistence

```
~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl
```

The thread-id is also the sessionId we use throughout keykeeper.

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

## Resume

```bash
codex exec resume <session-id> "<prompt>"
```

- `exec` = non-interactive, `resume` = its child subcommand
- **The "thread not found" log error is misleading and harmless.** The conversation IS appended to the original rollout; sessionId is preserved. We tested this empirically — kangaroo, iguana, and penguin all landed in the expected files.
- Top-level `codex resume` is the interactive (TUI) variant — not what we want from a programmatic invocation.

## MCP, plugins, project trust (we observe, don't drive)

- **MCP-provided tools** appear as normal `tool_use` events. No special handling — same path as built-in tools.
- **Plugins / marketplaces** (`[plugins."<name>"]` in config.toml) install their own command handlers. We don't introspect them — sessions using plugin tools just emit normal hook events for the underlying calls.
- **`[projects."<path>"] trust_level = "trusted"`** entries in config.toml control which repos Codex auto-trusts. Doesn't affect our hook flow but worth knowing exists if a user reports "Codex is asking permission for everything in this repo" — the answer is to add a project trust entry.
- **`mcp-server` and `app-server` subcommands.** Codex can run as an MCP server itself, or as a local websocket app server (`codex --remote ws://...`). We don't currently consume either — keykeeper observes Codex CLI sessions, not Codex serving as a backend to other tools.

## Gaps & quirks

- **Misleading error log on every resume**: `ERROR codex_core::session: failed to record rollout items: thread <id> not found`. Despite the message, content IS persisted. Easy to misdiagnose — we did, twice.
- **Live GUI (Desktop / VS Code) doesn't reactively pick up JSONL appends from sibling processes.** Same as Claude TUI: read-once on session load.
- **Version drift between CLI and Desktop.** Desktop ships a bundled binary (e.g. `0.126.0-alpha.8`) that may be ahead of the user's installed CLI (`codex --version`). Hook & rollout formats differ across versions. Handle both.
- **`async = true` hooks silently skipped.** No-op with a warning to stderr.
- **No `assistant_text` hook.** Same gap as Claude → handled by transcript watcher.
- **`exec resume` writes both old AND new format event types into the file** (event_msg + response_item duplicating content). The watcher only emits assistant_text from one path (response_item / final_answer) to avoid double-render.
