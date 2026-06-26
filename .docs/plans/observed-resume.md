# Plan: Drive observed wielders via session resume

**Status**: implemented 2026-06-24 · **Owner**: Realmkeeper · **Phase**: 2B

## Goal

Let the user send messages from realmkeeper's chat input to wielders that realmkeeper did **not** spawn — sessions started in a Claude TUI, Codex Desktop, Cursor IDE, or Gemini CLI.

The mechanism is **session resume**: every supported provider has a non-interactive `--resume`-style invocation that appends a turn to an existing session.

Implemented scope: direct per-wielder chat messages. Standing orders, decrees, and recall remain scoped to Realmkeeper-spawned sessions.

## What we verified

| Provider | Resume command | Same session? | Events |
|---|---|---|---|
| Claude | `claude -p "<prompt>" --output-format stream-json --verbose --resume <id>` | ✅ same id, append in place | stdout stream, with hook echoes suppressed |
| Codex | `codex app-server --stdio` + `thread/resume` + `turn/start` | ✅ same thread, append in place | app-server notifications, with hook echoes suppressed |
| Cursor | `cursor-agent --print --output-format stream-json --resume <chatId> "<prompt>"` | ✅ same chat, preserves context | stdout stream; hooks are sparse |
| Gemini | `gemini --prompt "<prompt>" --output-format stream-json --approval-mode yolo --resume <id>` | ✅ same session UUID | stdout stream, with hook echoes suppressed |

Historical empirical evidence: kangaroo / iguana / penguin (Codex), koala (Claude), falcon (Cursor) all landed in the expected files. Gemini UUID resume is verified by the active-spawn adapter's follow-up path.

## Approach

- **Claude / Gemini** — spawn the one-shot resume CLI and parse stdout as `source: "realmkeeper"` for that turn while suppressing hook echoes. Permission requests still pass through the hook bridge.
- **Codex** — start an app-server stdio client, `thread/resume`, then `turn/start`. Realmkeeper-spawned Codex sessions keep the app-server client alive and use `turn/steer` for active-turn interjection.
- **Cursor** — spawn the one-shot resume CLI, preserve the observed `cursor-...` session id in Realmkeeper, and parse `stream-json` stdout because resume hooks are sparse.
- **Live TUI/IDE divergence** — known and accepted. Original UIs read once on session load and don't watch their JSONLs. User's reply lands in realmkeeper; original surface stays stale until reload. Documented in [`../providers/claude.md`](../providers/claude.md) and friends.

## Scope

### In scope

1. Drop the `!unit.spawnedHere` gate on the messages-dialog chat input
2. Four resume adapter functions
3. Routing observed sends to those functions
4. Provider stdout → `source: "realmkeeper"` events for direct sends
5. Subtle "via realmkeeper" badge on prompts we originated

### Out of scope (explicit non-goals)

- Driving the live TUI/IDE input box from outside (would need tmux send-keys / AppleScript / a shim wrapper — see [vision.md § Known gaps](../vision.md))
- Bidirectional sync between realmkeeper and the live UI (TUI is read-once; we're not changing that)
- Standing orders, decrees, and recall for observed sessions
- A `--force`/`--yolo` Cursor mode toggle (separate decision; this plan leaves Cursor permissions observation-only)

## Implementation

### File-by-file

| File | Change | Notes |
|---|---|---|
| `src/main/adapters/claude-cli.ts` | Add `resumeClaudeSession({sessionId, cwd, prompt})` | Spawns the `claude -p ... --resume` one-shot and parses stdout with `source: "realmkeeper"` |
| `src/main/adapters/codex-cli.ts` / `codex-app-server.ts` | Add `resumeCodexSession({sessionId, cwd, prompt})` | Starts `codex app-server --stdio`, resumes the thread, then starts a turn. Realmkeeper-spawned Codex sessions keep the same app-server client alive and use `turn/steer` for active-turn interjection |
| `src/main/adapters/cursor-cli.ts` | Add `resumeCursorSession({sessionId, cwd, prompt})` | Strips `cursor-` for the CLI chat id, then parses stream-json stdout back onto the observed unit |
| `src/main/adapters/gemini-cli.ts` | Add `resumeGeminiSession({sessionId, cwd, prompt})` | Spawns `gemini --prompt ... --resume` and parses stdout with `source: "realmkeeper"` |
| `src/main/agent-manager.ts` | Add `AgentManager.sendToObserved(unit, prompt)` | Looks at `unit.tool`, dispatches to the right `resume*Session` |
| `src/main/index.ts` | Update `IPC.SendPrompt` handler | Existing managed agent → `AgentManager.send`; otherwise use resume metadata |
| `src/renderer/src/ui/WielderChatInput.tsx` | Drop observed-only disabled state | Sends `unitId`, `sessionId`, `tool`, and `cwd` |
| `src/renderer/src/ui/ConversationStream.tsx` | Add "via Realmkeeper" badge | Render on `user_prompt` events whose `source` field marks them as realmkeeper-originated |
| `src/shared/schemas/events.ts` | Extend `AgentEvent.source` union to include `"realmkeeper"` | Used to distinguish hook-originated from Realmkeeper-originated prompts |
| `src/main/event-bus.ts` | Suppress matching hook prompt echoes | Keeps resumed-turn prompt display single-sourced |

### Guardrails

- **"via realmkeeper" badge** — a small chip on user-prompt bubbles whose `source === "realmkeeper"`. Visual only; no behavior change.
- **No first-time notice popup** — initially scoped, decided to skip. The badge is enough; users will understand the divergence on their own. Revisit if usability testing says otherwise.

## Testing

- **Manual smoke per provider** — start a session in the provider's native UI, observe in realmkeeper, type from realmkeeper, verify the reply appears in the wielder's chat-drawer tab. Verify the original UI does NOT update (expected divergence).
- **Empirical resume verification** — see [`../providers/claude.md`](../providers/claude.md) § Resume for the JSONL diff procedure. Repeat per provider for any future regression.
- **Synthetic-event integrity** — verify `source: "realmkeeper"` user prompts render correctly in the chat-drawer tab and matching hook echoes are suppressed.

## Known limitations after shipping

- Live TUI/IDE divergence (intentional; see [vision.md § Known gaps](../vision.md))
- Codex app-server command/file/permission approvals are routed through permission cards; richer user-input, MCP elicitation, and dynamic tool requests still fail closed until Realmkeeper has typed UI for those request shapes

## Estimated size

Small. Maybe 200–300 LOC across ~7 files, plus the badge styling. The hard work was verification (already done); the implementation is mostly plumbing.
