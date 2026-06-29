# Claude Code (CLI: `claude`)

## Binary & install

- Binary: `claude` (verified locally 2026-06-29: `2.1.195 (Claude Code)`, typically `~/.claude/local/node_modules/@anthropic-ai/claude-code/cli.js` symlinked to `/usr/local/bin/claude`)
- Settings: `~/.claude/settings.json` (hooks live under `hooks.<EventName>`)
- Install hooks via the realmkeeper UI (Settings) or `installHooks()` in `src/main/hook-installer.ts`

## Hook events

PascalCase event names. We install all of these:

| Event | Direction | Purpose |
|---|---|---|
| `SessionStart` | fire-and-forget | New conversation begins |
| `SessionEnd` | fire-and-forget | Conversation actually ends (NOT per-turn — see "Stop" below) |
| `UserPromptSubmit` | fire-and-forget | User pressed enter on a prompt |
| `PreToolUse` | fire-and-forget or **bidirectional** for `AskUserQuestion` | About to execute a tool; answerable user questions |
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

`PreToolUse` / `AskUserQuestion` reply:
```json
{ "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": { "answers": { "Question text": "Selected answer" } }
} }
```

Realmkeeper handles `AskUserQuestion` by tagging the hook payload with a
`__rw_user_input_request_id`, rendering a normal answer letter, and returning
`updatedInput` when the King answers. If the letter is skipped, the bridge
returns a `PreToolUse` deny so the question does not hang silently.

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

The Connection tab reports the detected `claude --version`, hook config path,
transcript watcher root (`~/.claude/projects`), watcher poll interval, and the
rich stream flags Realmkeeper keeps off by default.

## Resume

```bash
claude -p "<prompt>" --output-format stream-json --verbose --resume <sessionId>
```

- Continues the **same** session id by default (verified: file appended in place, no fork)
- `--fork-session` to branch off instead
- `--print` is one-shot, exits after streaming the response
- All hooks fire normally on the resumed turn — events flow back through the bridge attributed to the original sessionId, so a wielder we already observe just appends a new turn

Use this to drive an observed wielder from realmkeeper without owning the original TUI process.

## 2026-06-29 CLI notes

Official CLI reference now documents several capabilities worth tracking:

- `claude -p`, `claude -c -p`, and `claude -r "<session>" "query"` are the supported non-interactive/query and resume forms.
- `--output-format stream-json`, `--verbose`, `--include-hook-events`, `--include-partial-messages`, and `--prompt-suggestions` are available for richer machine streams.
- `--input-format stream-json` with `--replay-user-messages` could eventually support a persistent stdin/stdout Claude process for Realmkeeper-owned sessions; today Realmkeeper uses one-shot `-p` calls and emits its own `source: "realmkeeper"` user prompt while suppressing matching hook echoes.
- `claude auth status` is the lightest status probe for the Connection tab. Prefer it over a model turn when checking whether Claude can run from this machine.
- `--max-budget-usd` is available for print-mode turns and is a good future launch guard for Realmkeeper-owned Claude wielders; do not silently add it without UI because it changes provider behavior.
- `--fallback-model` can make Realmkeeper-owned turns more resilient when the requested model is overloaded, but the UI must show the effective provider/model if a fallback happens.
- `--agent` / `--agents` can select or define custom agents for a turn. Realmkeeper should continue treating these as provider-native configuration until Wielder profiles can represent agent selection explicitly.
- `--bg`, `claude agents --json`, `claude attach`, `claude logs`, `claude stop`, and `claude respawn` expose first-class background sessions. Realmkeeper still treats Claude as hook/transcript-observed, but these commands are the best discovery/control path for already-running Claude background agents.
- `--remote-control` and `claude remote-control` are a separate provider-native control surface. They are not integrated yet; they may be useful if Realmkeeper needs to coordinate local and Claude.ai-visible sessions.
- `--brief` enables the provider-native `SendUserMessage` tool. It overlaps with Realmkeeper letters conceptually, but should stay off until we know the stream and hook payload shape.
- Live rich-stream probe with `--include-hook-events`, `--include-partial-messages`, and `--prompt-suggestions` produced `system` hook lifecycle events, `stream_event` message deltas, `rate_limit_event`, the normal final `assistant`, and `result`. The current loose parser accepts those event types and the normalizer safely ignores them unless we add explicit transient rendering.
- Public hook docs describe `PreToolUse` `updatedInput` as the client-side answer path for `AskUserQuestion`; Realmkeeper now implements that path through answer letters. A live deferred-resume fixture is still missing.
- A 2026-06-29 live probe with `--tools AskUserQuestion` did **not** expose the tool (`tools: []` in the init event). Claude emitted malformed XML-like text instead and hit the budget cap. Do not use that command shape as the live fixture path.

## MCP, agents, plugins (we observe, don't drive)

- **MCP-provided tools** appear as normal `tool_use` events with the MCP tool's name (no special prefix). We don't add MCP-specific handling — they flow through tool-name canonicalization like any built-in tool.
- **Sub-agents** spawned by Claude (Agent tool / `--agents` JSON / configured agents) emit `SubagentStop` when finished and have a different `session_id` from the parent. We render them as nested under the parent in the conversation stream (see `chat-event-subagent` indent class). The parent-child link is via `parentSessionId` on the spawned session.
- **Plugins** (configured in user settings.json) install hooks of their own. Multiple hooks per event are fine — Claude runs them all (e.g. peon-ping + realmkeeper-hook). The order is the install order in settings.json.

## Gaps & quirks

- **Stop ≠ SessionEnd.** Stop fires after every turn. Don't treat it as "session over." (We had a heuristic bug here — see `ConversationStream.tsx` interrupted-prompt comment.)
- **No `assistant_text` hook.** Transcript watcher is the only path. If Claude changes their on-disk format, the watcher breaks silently.
- **PostToolUse doesn't fire on Read of a missing file.** Only PreToolUse fires; the tool fails internally. We can't observe the result, only the attempt. Live with it (Option C from earlier debugging).
- **Live TUI doesn't watch its own JSONL.** If you `--resume` from another shell while the TUI is still open, the TUI keeps its in-memory state and is now stale. Reload (Ctrl-C, re-run `claude --resume <id>`) to re-sync.
- **`--bare` and `--safe-mode` disable hooks.** A user running `claude --bare` or `claude --safe-mode` is **invisible to realmkeeper**. `--bare` also skips LSP, plugins, auto-memory, CLAUDE.md discovery, and OAuth/keychain reads. If a user complains "my session isn't showing up", check these flags first.
- **`--max-budget-usd` is a stop guard, not a hard cost ceiling.** The 2026-06-29 live question probe stopped with `error_max_budget_usd` but reported total cost above the requested cap. Use it to limit runaway probes, not to promise an exact maximum.
- **IDE attach lock files** at `~/.claude/ide/<port>.lock` carry `{workspaceFolders, ideName}` — informational, not currently consumed.
- **Worktree workflow.** `claude --worktree` and `--from-pr` are first-class but we don't model worktrees as separate realmkeeper worlds (`resolveRepoRoot` walks to the worktree's `.git`, which is a file pointer back to the main repo). Sessions in worktrees end up under the main repo's world. Acceptable tradeoff; flagged here so future work knows.
