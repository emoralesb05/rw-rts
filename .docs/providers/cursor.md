# Cursor (CLI: `cursor-agent`, plus the IDE)

## Binary & install

- Binary: `cursor-agent` (the agent CLI; the IDE itself runs the same agent under the hood)
- Settings: `~/.cursor/hooks.json` (v1 schema, JSON, NOT TOML)
- Install hooks via `installCursorHooks()` in `src/main/cursor-hook-installer.ts`. Additive — preserves any existing entries (e.g. peon-ping).

## Hook events

camelCase event names (NOT PascalCase like Claude/Codex):

| Event | Direction | Notes |
|---|---|---|
| `sessionStart` | fire-and-forget | |
| `sessionEnd` | fire-and-forget | |
| `stop` | fire-and-forget | Per-turn |
| `beforeSubmitPrompt` | fire-and-forget | User input (similar to UserPromptSubmit) |
| `preToolUse` | fire-and-forget* | `permission: "ask"` is NOT enforced (see gaps) |
| `postToolUse` | fire-and-forget | |
| `afterAgentResponse` | fire-and-forget | **Cursor DOES expose assistant text — unlike Claude/Codex** |
| `beforeShellExecution` | observation only | We tag with request_id, return `"ask"` immediately |

Hook reply schema:
```json
{ "permission": "allow" | "deny" | "ask",
  "user_message": "...",
  "agent_message": "..." }
```

The bridge dispatches Cursor events by detecting camelCase first letter (vs PascalCase for Claude/Codex).

## Two identifiers (this confused us — read carefully)

- **Cursor sessionId** in hook payloads = the **process** session UUID, fresh for each `cursor-agent` invocation
- **chatId** = the persistent conversation in the chat database
- These are **NOT the same**. One chat can be touched by many process sessions over its lifetime.

In `--print --resume <chatId>` mode the sessionId Cursor emits in hooks IS the chatId — a useful exception. In normal IDE use, the sessionId is a fresh process UUID.

## Chat persistence

```
~/.cursor/chats/<workspaceHash>/<chatId>/store.db   (SQLite)
```

- `meta` table: 1 row, `(key, value TEXT)`
- `blobs` table: many rows, `(id TEXT, data BLOB)` — gzip-compressed protobuf-ish content with assistant/user turns embedded as JSON-in-text fragments

We don't currently parse this store. We rely on hooks for visibility.

## Allowlist mode caveat (permissions)

Cursor's default `approvalMode: "allowlist"` makes hook responses **advisory only** for permissions. A hook returning `permission: "allow"` does not bypass the allowlist — the user still gets prompted in the IDE. To make hooks authoritative for approval you need `--force` or `--yolo`.

This is why our Cursor permission flow is **observation-only**: we return `"ask"` immediately, present a letter in keykeeper for awareness, no decision power.

## Spawn pattern (when keykeeper starts the session)

`src/main/adapters/cursor-cli.ts` does it in two steps:

```bash
cursor-agent create-chat                         # returns a fresh chatId
cursor-agent --print --output-format stream-json --resume <chatId> "<prompt>"
```

Pre-creating the chat means we know the chatId before the agent runs — we can register the wielder, route hook events from the get-go, and stream tool calls / responses live via `stream-json`.

Follow-up prompts in the same wielder spawn another `cursor-agent` invocation against the same chatId (same pattern as resume below).

## Resume

```bash
cursor-agent --print --resume <chatId> "<prompt>"
```

**Resume preserves the prior conversation** (verified — same `chatId` directory, same `store.db`, growing in place). Cursor uses the chatId as the sessionId in the limited hooks that DO fire here.

## MCP, rules, plans, modes (we observe, don't drive)

- **MCP-provided tools** appear as normal `tool_use` events. We don't introspect or drive Cursor's MCP servers; users manage them via `cursor-agent mcp`.
- **Cursor rules** (per-project rules from `.cursor/rules/` and global rules) influence the model's behavior but don't fire any keykeeper-visible events. We see only the resulting tool calls.
- **Cursor plans** (CTRL+K plan mode artifacts) are stored in `~/.cursor/plans/` — separate from chats. Out of scope for the hook flow.
- **`--mode plan` / `--mode ask`** are read-only execution modes. If a user starts a wielder in plan mode, no edits will happen — they'll see only `tool_use` events for read tools. Worth knowing if "wielder seems to be doing nothing."

## Gaps & quirks

- **`--print --resume` strips MOST hooks.** Only `sessionEnd` fires. No `beforeSubmitPrompt`, no `afterAgentResponse`, no `preToolUse`/`postToolUse`. So keykeeper sees nothing of the live event stream — even though the conversation lands correctly in the chat database.
  - **Workaround**: capture the assistant reply on stdout from `--print`, synthesize `user_prompt` + `assistant_text` events ourselves (using chatId as sessionId), inject into the bus. Tool calls during the reply remain invisible (no PostToolUse fires).
- **Allowlist mode advisory.** Hook-allow doesn't bypass the IDE prompt unless `--force`/`--yolo`. We're observational by design.
- **Process sessionId vs chatId.** When the user opens a fresh Cursor IDE session against an existing chat, the events come in under a NEW process sessionId. We currently see this as a new wielder; aggregating by chatId would require a Cursor-specific mapping (chatId is not in every hook payload).
- **No equivalent of `--include-non-interactive`.** All resume paths assume an interactive UI eventually opens the chat — no first-class headless flow other than `--print`.
- **No public IDE-attach API for command injection.** We can write to the chat (via `--print --resume`), but can't drive the IDE's input box from outside.
