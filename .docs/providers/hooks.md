# Hooks (cross-tool overview)

For per-provider specifics see [`claude.md`](./claude.md), [`codex.md`](./codex.md), [`cursor.md`](./cursor.md), [`gemini.md`](./gemini.md). This page covers the shared shape and the multiplexer.

## Protocol

Each provider's hook system follows the same pattern:

1. Provider invokes a configured **command** at hook time
2. Provider writes a **JSON payload** to the command's stdin
3. Command writes a **JSON response** to stdout (or exits cleanly = no-op where that provider allows it)
4. Provider acts on the response (allow/deny/etc.) and proceeds

We use **one** command for all four tools: `bin/realmkeeper-hook` (Python). It branches on `hook_event_name`; for Codex and Gemini it's invoked with `--tool <name>` to disambiguate PascalCase event names.

## Event-name conventions

| Tool | Convention | Example |
|---|---|---|
| Claude | PascalCase | `PreToolUse` |
| Codex | PascalCase | `PreToolUse` (same as Claude) |
| Cursor | camelCase | `preToolUse` |
| Gemini | PascalCase | `BeforeTool` |

The bridge dispatches by case of the first letter:
- camelCase → Cursor normalizer
- PascalCase → Claude, Codex, or Gemini (disambiguated by `__rw_tool` marker on payload)

## Event coverage matrix

| Concept | Claude | Codex | Cursor | Gemini |
|---|---|---|---|---|
| Session start | `SessionStart` | `SessionStart` | `sessionStart` | `SessionStart` |
| Session end | `SessionEnd` | `SessionEnd` | `sessionEnd` | `SessionEnd` |
| User prompt | `UserPromptSubmit` | `UserPromptSubmit` | `beforeSubmitPrompt` | `BeforeAgent` |
| Tool about to run | `PreToolUse` | `PreToolUse` | `preToolUse` | `BeforeTool` |
| Tool finished | `PostToolUse` | `PostToolUse` | `postToolUse` | `AfterTool` |
| Permission gate | `PermissionRequest` (bi) | `PermissionRequest` (bi) | `beforeShellExecution` (advisory) | `BeforeTool` (bi deny gate) + `Notification/ToolPermission` (advisory) |
| User input / elicitation | `PreToolUse` / `AskUserQuestion` (bi `updatedInput`) | app-server `item/tool/requestUserInput`; typed MCP `form` elicitation | — | — |
| Per-turn done | `Stop` | `Stop` | `stop` | `AfterAgent` |
| Subagent done | `SubagentStop` | — | — | — |
| Assistant text | ❌ — needs transcript watcher | ❌ — needs transcript watcher | `afterAgentResponse` ✅ | `AfterAgent.prompt_response` ✅ |

## Permission flow per tool

Before rendering a permission letter, the bridge checks Realmkeeper-local saved
rules in `~/.realmkeeper/permissions.json`. Matching actionable Claude, Codex,
or Gemini requests are answered immediately and logged as `permission_resolved`
audit rows. The rules are provider-neutral and exact-request scoped by provider,
tool name, session/workspace/global scope, and a stable input key such as
`cmd:pnpm test` or `file:/repo/src/app.ts`. Realmkeeper does not currently write
provider-native persistent permission config from this path.

**Claude** (`PermissionRequest`):
- Bidirectional. We tag with a `requestId`, block on the socket waiting for the user's allow/deny in realmkeeper, then write `{hookSpecificOutput: {decision: {behavior, message}}}` to stdout.
- Claude's terminal also shows its own native prompt concurrently — first to commit wins.
- `PreToolUse` for `AskUserQuestion` is also bidirectional. Realmkeeper tags it with `__rw_user_input_request_id`, renders an answer letter, then writes `permissionDecision: "allow"` with `updatedInput.answers` when answered, or denies when skipped.

**Codex** (`PermissionRequest`):
- Same shape as Claude. Bidirectional. Codex doesn't render its own competing prompt for hook-mediated permissions.

**Cursor** (`beforeShellExecution`):
- Observation-only by design. Cursor's `allowlist` approvalMode treats hook `permission: "allow"` as advisory; the user must confirm in Cursor's UI anyway. So `realmkeeper-hook` returns `{permission: "ask"}` immediately and forwards visibility to realmkeeper as a fire-and-forget event.

**Gemini** (`BeforeTool` + `Notification` / `ToolPermission`):
- `BeforeTool` is bidirectional and Realmkeeper blocks on it. Deny prevents the tool from executing. Allow lets the hook proceed. The Gemini installer also writes a managed user policy that auto-allows Gemini's native policy prompt after Realmkeeper has already gated the tool; the hook command runs fail-closed so Gemini denies if Realmkeeper is unavailable.
- `Notification/ToolPermission` is observation-only by design. Gemini's Notification hook cannot approve or deny; realmkeeper returns `{}` to Gemini immediately and does not render an ack-only letter.

## The multiplexer (`bin/realmkeeper-hook`)

- Reads JSON from stdin, parses `hook_event_name`
- Optional `--tool <name>` argv flag (used for Codex and Gemini) tags payload with `__rw_tool`
- Gemini payloads are also backfilled from `GEMINI_SESSION_ID` / `GEMINI_CWD` env vars before forwarding if a CLI build omits those stdin fields
- Writes payload to `~/.realmkeeper/realmkeeper.sock`
- For bidirectional events: blocks on socket recv, writes provider-shaped reply to stdout
- For fire-and-forget: half-closes after send and exits silently where allowed. Gemini writes `{}` because its hook runner expects JSON stdout.
- All branches wrapped in try/except; we never want the hook to break the user's CLI session
