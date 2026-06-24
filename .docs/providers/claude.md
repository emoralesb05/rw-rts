# Claude Code (CLI: `claude`)

## Binary & install

- Binary: `claude` (typically `~/.claude/local/node_modules/@anthropic-ai/claude-code/cli.js` symlinked to `/usr/local/bin/claude`)
- Settings: `~/.claude/settings.json` (hooks live under `hooks.<EventName>`)
- Install hooks via the realmkeeper UI (Settings) or `installHooks()` in `src/main/hook-installer.ts`

## Hook events

PascalCase event names. We install all of these:

| Event | Direction | Purpose |
|---|---|---|
| `SessionStart` | fire-and-forget | New conversation begins |
| `SessionEnd` | fire-and-forget | Conversation actually ends (NOT per-turn — see "Stop" below) |
| `UserPromptSubmit` | fire-and-forget | User pressed enter on a prompt |
| `PreToolUse` | fire-and-forget | About to execute a tool |
| `PostToolUse` | fire-and-forget | Tool finished (success OR fail — see gap below) |
| `Stop` | fire-and-forget | Agent finished one turn (one assistant response done) |
| `SubagentStop` | fire-and-forget | A spawned sub-agent finished |
| `PermissionRequest` | **bidirectional** | Asks if a tool call may run; reply blocks |

Payload shape (excerpt):
```json
{
  "hook_event_name": "PreToolUse",
  "session_id": "<uuid>",
  "cwd": "/Users/ed/Github/foo",
  "tool_name": "Bash",
  "tool_input": { "command": "ls -la" },
  "tool_use_id": "toolu_..."
}
```

`PermissionRequest` reply:
```json
{ "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": { "behavior": "allow" | "deny", "message": "optional reason" }
} }
```

## Transcript persistence

```
~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
```

- `<encoded-cwd>` = the cwd with `/` replaced by `-` (leading `-` included)
- One line per event; `type` field tells you what (`user`, `assistant`, `system`, `tool_use`, etc.)

## Why we have a transcript watcher

**Claude does NOT fire any `assistant_text` / `afterAgentResponse` hook.** To capture assistant replies, `src/main/adapters/claude-transcript.ts` polls each `<sessionId>.jsonl` for new `type: "assistant"` lines and emits synthetic `assistant_text` events into the bus.

Watcher contract:
- Polls every **2s**
- New files registered at **current size** (don't replay history on first sight)
- Tracks `Map<path, {size, carry, emittedItemIds}>` per file
- If a file shrinks (rotation), reset to size 0
- Emits the FULL assistant turn at once when the JSONL line arrives — not per-token streaming. Tradeoff: chunkier UX but no inter-token state to manage.

## Resume

```bash
claude --resume <sessionId> --print "<prompt>"
```

- Continues the **same** session id by default (verified: file appended in place, no fork)
- `--fork-session` to branch off instead
- `--print` is one-shot, exits after streaming the response
- All hooks fire normally on the resumed turn — events flow back through the bridge attributed to the original sessionId, so a wielder we already observe just appends a new turn

Use this to drive an observed wielder from realmkeeper without owning the original TUI process.

## MCP, agents, plugins (we observe, don't drive)

- **MCP-provided tools** appear as normal `tool_use` events with the MCP tool's name (no special prefix). We don't add MCP-specific handling — they flow through tool-name canonicalization like any built-in tool.
- **Sub-agents** spawned by Claude (Agent tool / `--agents` JSON / configured agents) emit `SubagentStop` when finished and have a different `session_id` from the parent. We render them as nested under the parent in the conversation stream (see `chat-event-subagent` indent class). The parent-child link is via `parentSessionId` on the spawned session.
- **Plugins** (configured in user settings.json) install hooks of their own. Multiple hooks per event are fine — Claude runs them all (e.g. peon-ping + realmkeeper-hook). The order is the install order in settings.json.

## Gaps & quirks

- **Stop ≠ SessionEnd.** Stop fires after every turn. Don't treat it as "session over." (We had a heuristic bug here — see `ConversationStream.tsx` interrupted-prompt comment.)
- **No `assistant_text` hook.** Transcript watcher is the only path. If Claude changes their on-disk format, the watcher breaks silently.
- **PostToolUse doesn't fire on Read of a missing file.** Only PreToolUse fires; the tool fails internally. We can't observe the result, only the attempt. Live with it (Option C from earlier debugging).
- **Live TUI doesn't watch its own JSONL.** If you `--resume` from another shell while the TUI is still open, the TUI keeps its in-memory state and is now stale. Reload (Ctrl-C, re-run `claude --resume <id>`) to re-sync.
- **`--bare` mode disables hooks entirely.** A user running `claude --bare` (minimal mode for sandboxes / API-only workflows) is **invisible to realmkeeper**. The flag also skips LSP, plugins, auto-memory, CLAUDE.md discovery. If a user complains "my session isn't showing up", check whether they invoked with `--bare`.
- **IDE attach lock files** at `~/.claude/ide/<port>.lock` carry `{workspaceFolders, ideName}` — informational, not currently consumed.
- **Worktree workflow.** `claude --worktree` and `--from-pr` are first-class but we don't model worktrees as separate realmkeeper worlds (`resolveRepoRoot` walks to the worktree's `.git`, which is a file pointer back to the main repo). Sessions in worktrees end up under the main repo's world. Acceptable tradeoff; flagged here so future work knows.
