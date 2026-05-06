# Hooks (cross-tool overview)

For per-provider specifics see [`claude.md`](./claude.md), [`codex.md`](./codex.md), [`cursor.md`](./cursor.md), [`gemini.md`](./gemini.md). This page covers the shared shape and the multiplexer.

## Protocol

Each provider's hook system follows the same pattern:

1. Provider invokes a configured **command** at hook time
2. Provider writes a **JSON payload** to the command's stdin
3. Command writes a **JSON response** to stdout (or exits cleanly = no-op where that provider allows it)
4. Provider acts on the response (allow/deny/etc.) and proceeds

We use **one** command for all four tools: `bin/keykeeper-hook` (Python). It branches on `hook_event_name`; for Codex and Gemini it's invoked with `--tool <name>` to disambiguate PascalCase event names.

## Event-name conventions

| Tool | Convention | Example |
|---|---|---|
| Claude | PascalCase | `PreToolUse` |
| Codex | PascalCase | `PreToolUse` (same as Claude) |
| Cursor | camelCase | `preToolUse` |
| Gemini | PascalCase | `BeforeTool` |

The bridge dispatches by case of the first letter:
- camelCase → Cursor normalizer
- PascalCase → Claude, Codex, or Gemini (disambiguated by `__kh_tool` marker on payload)

## Event coverage matrix

| Concept | Claude | Codex | Cursor | Gemini |
|---|---|---|---|---|
| Session start | `SessionStart` | `SessionStart` | `sessionStart` | `SessionStart` |
| Session end | `SessionEnd` | `SessionEnd` | `sessionEnd` | `SessionEnd` |
| User prompt | `UserPromptSubmit` | `UserPromptSubmit` | `beforeSubmitPrompt` | `BeforeAgent` |
| Tool about to run | `PreToolUse` | `PreToolUse` | `preToolUse` | `BeforeTool` |
| Tool finished | `PostToolUse` | `PostToolUse` | `postToolUse` | `AfterTool` |
| Permission gate | `PermissionRequest` (bi) | `PermissionRequest` (bi) | `beforeShellExecution` (advisory) | `BeforeTool` (bi deny gate) + `Notification/ToolPermission` (advisory) |
| Per-turn done | `Stop` | `Stop` | `stop` | `AfterAgent` |
| Subagent done | `SubagentStop` | — | — | — |
| Assistant text | ❌ — needs transcript watcher | ❌ — needs transcript watcher | `afterAgentResponse` ✅ | `AfterAgent.prompt_response` ✅ |

## Permission flow per tool

**Claude** (`PermissionRequest`):
- Bidirectional. We tag with a `requestId`, block on the socket waiting for the user's allow/deny in keykeeper, then write `{hookSpecificOutput: {decision: {behavior, message}}}` to stdout.
- Claude's terminal also shows its own native prompt concurrently — first to commit wins.

**Codex** (`PermissionRequest`):
- Same shape as Claude. Bidirectional. Codex doesn't render its own competing prompt for hook-mediated permissions.

**Cursor** (`beforeShellExecution`):
- Observation-only by design. Cursor's `allowlist` approvalMode treats hook `permission: "allow"` as advisory; the user must confirm in Cursor's UI anyway. So `keykeeper-hook` returns `{permission: "ask"}` immediately and forwards visibility to keykeeper as a fire-and-forget event.

**Gemini** (`BeforeTool` + `Notification` / `ToolPermission`):
- `BeforeTool` is bidirectional and Keykeeper blocks on it. Deny prevents the tool from executing. Allow lets the hook proceed. The Gemini installer also writes a managed user policy that auto-allows Gemini's native policy prompt after Keykeeper has already gated the tool; the hook command runs fail-closed so Gemini denies if Keykeeper is unavailable.
- `Notification/ToolPermission` is observation-only by design. Gemini's Notification hook cannot approve or deny; keykeeper returns `{}` to Gemini immediately and does not render an ack-only letter.

## The multiplexer (`bin/keykeeper-hook`)

- Reads JSON from stdin, parses `hook_event_name`
- Optional `--tool <name>` argv flag (used for Codex and Gemini) tags payload with `__kh_tool`
- Gemini payloads are also backfilled from `GEMINI_SESSION_ID` / `GEMINI_CWD` env vars before forwarding if a CLI build omits those stdin fields
- Writes payload to `~/.keykeeper/keykeeper.sock`
- For bidirectional events: blocks on socket recv, writes provider-shaped reply to stdout
- For fire-and-forget: half-closes after send and exits silently where allowed. Gemini writes `{}` because its hook runner expects JSON stdout.
- All branches wrapped in try/except; we never want the hook to break the user's CLI session
