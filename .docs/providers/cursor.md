# Cursor (CLI: `cursor-agent`, plus the IDE)

## Binary & install

- Binary: `cursor-agent` (verified locally 2026-06-25: `2026.06.24-00-45-58-9f61de7`; the IDE itself runs the same agent under the hood)
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

Realmkeeper keeps its routing key unchanged but adds explicit diagnostic
metadata to Cursor event payloads:

- `cursorChatId` / `providerConversationId`: the raw persistent Cursor chat id.
- `providerSessionId`: the raw Cursor process session id when the hook or stream
  payload exposes it.

For observed hook traffic, Realmkeeper still prefixes the routing id as
`cursor-<chatId>` so it cannot collide with other providers. For resume calls, it
strips that prefix before calling `cursor-agent --resume <chatId>`.

## Chat persistence

```
~/.cursor/chats/<workspaceHash>/<chatId>/store.db   (SQLite)
```

- `meta` table: 1 row, `(key, value TEXT)`
- `blobs` table: many rows, `(id TEXT, data BLOB)` — gzip-compressed protobuf-ish content with assistant/user turns embedded as JSON-in-text fragments

We don't currently parse this store. We rely on hooks for visibility.

## Allowlist mode caveat (permissions)

Cursor's default `approvalMode: "allowlist"` makes hook responses **advisory only** for permissions. A hook returning `permission: "allow"` does not bypass the allowlist — the user still gets prompted in the IDE. To make hooks authoritative for approval you need `--force` or `--yolo`.

This is why our Cursor permission flow is **observation-only**: we return `"ask"` immediately, present a letter in realmkeeper for awareness, no decision power.

## Spawn pattern (when realmkeeper starts the session)

`src/main/adapters/cursor-cli.ts` does it in two steps:

```bash
cursor-agent create-chat                         # returns a fresh chatId
cursor-agent --print --output-format stream-json --force --trust --resume <chatId> "<prompt>"
```

Pre-creating the chat means we know the chatId before the agent runs — we can register the wielder, route hook events from the get-go, and stream tool calls / responses live via `stream-json`.

Follow-up prompts in the same wielder spawn another `cursor-agent` invocation against the same chatId (same pattern as resume below).

Realmkeeper-spawned Cursor sessions intentionally use `--force --trust` today. That makes Realmkeeper-controlled Cursor sessions more autonomous than observed IDE sessions, where permission letters remain observation-only and Cursor's native UI decides. Before distributing this broadly, make this behavior a visible setting or at least a launch-time warning.

## Resume

```bash
cursor-agent --print --output-format stream-json --resume <chatId> "<prompt>"
```

**Resume preserves the prior conversation** (verified — same `chatId` directory, same `store.db`, growing in place). Cursor uses the chatId as the sessionId in the limited hooks that DO fire here. Realmkeeper parses `stream-json` stdout for realmkeeper-driven turns, so direct messages to observed Cursor chats can still render assistant text and completed tool calls even when hooks are sparse.

## 2026-06-29 CLI notes

Local `cursor-agent --help` exposes:

- `--resume [chatId]` and `--continue` for conversation continuity.
- `--print`, `--output-format text|json|stream-json`, and `--stream-partial-output` for headless/stdout operation.
- `create-chat`, `resume`, `ls`, and `models` subcommands for chat lifecycle/discovery and model availability.
- `--mode plan`, `--mode ask`, `--plan`, and parameterized `--model` values for read-only/planning sessions and model tuning.
- `--force`/`--yolo`, `--auto-review`, `--sandbox enabled|disabled`, `--trust`, and `--workspace` for autonomy and workspace handling.
- `--plugin-dir`, `mcp`, `generate-rule`, and `worker` for local plugin/MCP/rule workflows and private cloud worker mode.

Realmkeeper still uses `--force --trust` only for sessions it starts itself. `--auto-review` is a candidate replacement if we want Cursor's server classifier to auto-run safe tool calls while asking for the rest, but that is a product decision because it changes current autonomy semantics. Observed IDE sessions keep Cursor's native allowlist/confirmation behavior; Realmkeeper's letters remain informational for those.

## MCP, rules, plans, modes (we observe, don't drive)

- **MCP-provided tools** appear as normal `tool_use` events. We don't introspect or drive Cursor's MCP servers; users manage them via `cursor-agent mcp`.
- **Cursor rules** (per-project rules from `.cursor/rules/` and global rules) influence the model's behavior but don't fire any realmkeeper-visible events. We see only the resulting tool calls.
- **Cursor plans** (CTRL+K plan mode artifacts) are stored in `~/.cursor/plans/` — separate from chats. Out of scope for the hook flow.
- **`--mode plan` / `--mode ask`** are read-only execution modes. If a user starts a wielder in plan mode, no edits will happen — they'll see only `tool_use` events for read tools. Worth knowing if "wielder seems to be doing nothing."

## Gaps & quirks

- **`--print --resume` strips MOST hooks.** Only `sessionEnd` fires. No `beforeSubmitPrompt`, no `afterAgentResponse`, no `preToolUse`/`postToolUse`. Use `--output-format stream-json` and parse stdout for realmkeeper-driven observed turns; don't rely on hooks for those events.
- **Allowlist mode advisory.** Hook-allow doesn't bypass the IDE prompt unless `--force`/`--yolo`. We're observational by design.
- **Headless auth differs from status.** On 2026-06-29, `cursor-agent status` reported login success and `create-chat` returned a chat id, but `--print --output-format stream-json --resume <chatId>` exited with `Authentication required`. Treat headless stream fixtures as blocked until `cursor-agent login` works for print mode or `CURSOR_API_KEY` is set.
- **Process sessionId vs chatId.** When the user opens a fresh Cursor IDE session against an existing chat, the events come in under a NEW process sessionId. Realmkeeper now emits both ids when Cursor exposes them, but aggregating older payloads still requires a Cursor-specific mapping because chatId is not guaranteed in every hook payload.
- **No equivalent of `--include-non-interactive`.** All resume paths assume an interactive UI eventually opens the chat — no first-class headless flow other than `--print`.
- **No public IDE-attach API for command injection.** We can write to the chat (via `--print --resume`), but can't drive the IDE's input box from outside.
