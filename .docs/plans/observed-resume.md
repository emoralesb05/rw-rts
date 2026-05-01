# Plan: Drive observed wielders via session resume

**Status**: planned, not started · **Owner**: TBD · **Phase**: 2B

## Goal

Let the user send messages from keykeeper's chat input to wielders that keykeeper did **not** spawn — sessions started in a Claude TUI, Codex Desktop, or Cursor IDE. Today the chat input is gated on `unit.spawnedHere` and silently no-ops for observed wielders.

The mechanism is **session resume**: every supported provider has a non-interactive `--resume`-style invocation that appends a turn to an existing session. We've verified all three work; this plan turns that into a feature.

## What we verified (2026-04-30)

| Provider | Resume command | Same session? | Hooks fire? | Notes |
|---|---|---|---|---|
| Claude | `claude --resume <id> --print "<prompt>"` | ✅ same id, append in place | ✅ all | Cleanest path. |
| Codex | `codex exec resume <id> "<prompt>"` | ✅ same thread, append in place | ✅ all | Logs misleading `thread not found` error — harmless. |
| Cursor | `cursor-agent --print --resume <chatId> "<prompt>"` | ✅ same chat, preserves context | ❌ only `sessionEnd` | `--print --resume` strips beforeSubmitPrompt/afterAgentResponse/preToolUse/postToolUse. |

Empirical evidence in this session: kangaroo / iguana / penguin (Codex), koala (Claude), falcon (Cursor) all landed in the expected files.

## Approach

- **Claude / Codex** — spawn the one-shot CLI, let existing hooks + transcript watcher push events through the bridge attributed to the original sessionId. Zero special-case rendering.
- **Cursor** — spawn the one-shot CLI, parse the assistant text from stdout, **synthesize** `user_prompt` + `assistant_text` AgentEvents and inject them into the bus with chatId as sessionId. Tool calls during the reply remain invisible (no PostToolUse hook).
- **Live TUI/IDE divergence** — known and accepted. Original UIs read once on session load and don't watch their JSONLs. User's reply lands in keykeeper; original surface stays stale until reload. Documented in [`../providers/claude.md`](../providers/claude.md) and friends.

## Scope

### In scope

1. Drop the `!unit.spawnedHere` gate on the messages-dialog chat input
2. Three resume adapter functions
3. Routing observed sends to those functions
4. Cursor stdout → event synthesis
5. Subtle "via keykeeper" badge on prompts we originated
6. Disable send when wielder is in-flight (any tool/text event in last ~5s)

### Out of scope (explicit non-goals)

- Driving the live TUI/IDE input box from outside (would need tmux send-keys / AppleScript / a shim wrapper — see [vision.md § Known gaps](../vision.md))
- Bidirectional sync between keykeeper and the live UI (TUI is read-once; we're not changing that)
- Showing tool calls during a Cursor `--print --resume` turn (Cursor strips those hooks; would require parsing Cursor's stream-json output, larger effort)
- A `--force`/`--yolo` Cursor mode toggle (separate decision; this plan leaves Cursor permissions observation-only)

## Implementation

### File-by-file

| File | Change | Notes |
|---|---|---|
| `src/main/adapters/claude-cli.ts` | Add `resumeClaudeSession({sessionId, cwd, prompt})` | Spawns `claude --resume <id> --print <prompt>`. One-shot, exits when done. No process bookkeeping needed (each turn = fresh process) |
| `src/main/adapters/codex-cli.ts` | Add `resumeCodexSession({sessionId, cwd, prompt})` | Spawns `codex exec resume <id> "<prompt>"`. Same one-shot pattern. Tolerate the misleading `thread not found` log |
| `src/main/adapters/cursor-cli.ts` | Add `resumeCursorSession({chatId, cwd, prompt})` | Spawns `cursor-agent --print --resume <chatId> "<prompt>"`. Captures stdout, synthesizes events on completion |
| `src/main/agent-manager.ts` | Add `AgentManager.sendToObserved(unit, prompt)` | Looks at `unit.tool`, dispatches to the right `resume*Session` |
| `src/main/index.ts` | Update `IPC.SendPrompt` handler | Branch on `unit.spawnedHere`: spawned → existing `AgentManager.send`; observed → `sendToObserved` |
| `src/renderer/src/store.ts` | Drop `!unit.spawnedHere` gate from chat-input action | Single-line change |
| `src/renderer/src/ui/floating/WielderPanelBody.tsx` | Drop disabled state on chat input for observed wielders | Add the in-flight guard (~5s window) |
| `src/renderer/src/ui/ConversationStream.tsx` | Add "↳ via keykeeper" badge | Render on `user_prompt` events whose `source` field marks them as keykeeper-originated |
| `src/shared/events.ts` | Extend `AgentEvent.source` union to include `"keykeeper"` (or add a new field) | Used to distinguish hook-originated from synthesized prompts |
| `src/main/event-bus.ts` | Helper to inject synthetic events from Cursor stdout | Called by `resumeCursorSession` |

### Cursor stdout synthesis (the only non-trivial bit)

`cursor-agent --print` streams the assistant text on stdout. We:

1. Spawn the process, capture stdout
2. On process exit, take the full stdout
3. Emit two events on the bus:
   - `user_prompt` with the prompt we sent
   - `assistant_text` with the captured stdout
4. Both with `sessionId = chatId`, `source = "keykeeper"`, `tool = "cursor"`

Idiomatic place: `resumeCursorSession()` in `cursor-cli.ts` → calls a small helper from `event-bus.ts` (`bus.emitSynthetic(event)`).

### Guardrails

- **"via keykeeper" badge** — a small chip on user-prompt bubbles whose `source === "keykeeper"`. Visual only; no behavior change.
- **In-flight guard** — disable the chat input if the wielder has emitted any `tool_use` / `tool_result` / `assistant_text` / `user_prompt` in the last 5 seconds. Prevents accidental interleaving with an active turn.
- **No first-time notice popup** — initially scoped, decided to skip. The badge is enough; users will understand the divergence on their own. Revisit if usability testing says otherwise.

## Testing

- **Manual smoke per provider** — start a session in the provider's native UI, observe in keykeeper, type from keykeeper, verify the reply appears in the wielder's messages tab. Verify the original UI does NOT update (expected divergence).
- **Empirical resume verification** — see [`../providers/claude.md`](../providers/claude.md) § Resume for the JSONL diff procedure. Repeat per provider for any future regression.
- **Synthetic-event integrity** — for Cursor, verify the synthesized `user_prompt` + `assistant_text` events render correctly in the messages tab and are deduped by the bridge if a (rare) hook also fires for the same content.

## Known limitations after shipping

- Live TUI/IDE divergence (intentional; see [vision.md § Known gaps](../vision.md))
- Cursor tool calls invisible during keykeeper-driven turns
- Codex's misleading `thread not found` log will appear in dev console every time we resume a Codex thread — harmless but noisy

## Estimated size

Small. Maybe 200–300 LOC across ~7 files, plus the badge styling. The hard work was verification (already done); the implementation is mostly plumbing.
