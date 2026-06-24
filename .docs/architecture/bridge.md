# The hook bridge

`src/main/adapters/hook-bridge.ts` — the unix-socket bridge that ingests payloads from `bin/realmkeeper-hook` (and any other producer), normalizes them to a single `AgentEvent` shape, and pushes them onto the in-process event bus.

## Socket

```
~/.realmkeeper/realmkeeper.sock
```

- Created on `startHookBridge()` at app boot
- `allowHalfOpen: true` so fire-and-forget callers can shutdown(WR) without confusing us
- Removed and re-bound on every startup (handles stale sockets from crashes)

## Sender topology

```
provider hook fires
   ↓
bin/realmkeeper-hook  (Python; one process per hook fire)
   ↓ writes JSON, optionally tagged with --tool / __rw_tool
~/.realmkeeper/realmkeeper.sock
   ↓
hook-bridge.ts  (in main)
   ↓ normalize → AgentEvent
event-bus.ts
   ↓
mainWindow.webContents.send(IPC.EventStream, event)
   ↓
renderer (zustand store)
```

## Dispatch

The bridge inspects the event-name case and optional tool marker to pick a normalizer:

```ts
if (eventName[0] === eventName[0].toLowerCase()) {
  return normalizeCursorPayload(p, eventName);
}
const tool = (p?.__rw_tool as string | undefined) ?? "claude";
if (tool === "gemini") return normalizeGeminiPayload(p, eventName);
return normalizeClaudePayload(p, eventName, tool === "codex" ? "codex" : "claude");
```

- camelCase → Cursor
- PascalCase → Claude by default
- `__rw_tool: "codex"` → Codex through the Claude-shaped normalizer
- `__rw_tool: "gemini"` → Gemini through its own normalizer

## Tool-name canonicalization

Each provider names its tools differently — Cursor calls Bash `run_terminal_command_v2`, Codex calls it `command_execution`, Gemini calls shell execution `run_shell_command`, and Claude just calls it `Bash`. We normalize at the bridge so the renderer can render one card type per logical tool.

```ts
const TOOL_NAME_CANONICAL: Record<string, string> = {
  // Cursor
  run_terminal_command_v2: "Bash",
  read_file: "Read",
  edit_file: "Edit",
  // Codex
  command_execution: "Bash",
  apply_patch: "Edit",
  // Gemini
  run_shell_command: "Bash",
  // ...
};
```

## Dedup

Several providers re-fire the same hook in rapid succession (validate-then-execute pattern, or PreToolUse+PostToolUse with same `tool_use_id` shape, or Cursor double-firing decision-making hooks). Without dedup, the renderer shows duplicates.

- Standard TTL: **1.5s**
- UserPromptSubmit / beforeSubmitPrompt TTL: **12s** (user can interrupt + retype within seconds, and we don't want the second send to be eaten)
- Permission events: **never deduped** (each request needs its own decision)
- Key: `tool_use_id` if present, otherwise content hash of the payload
- Map-based with periodic cleanup when size > 200

## Permission resolution path

Bidirectional permission events are stored in a `Pending` map keyed by `requestId`:

```ts
{ socket, sessionId, cwd, tool }
```

When the user clicks allow/deny in realmkeeper:
1. Renderer fires `IPC.ResolvePermission`
2. Main calls `resolvePermissionRequest(requestId, decision, message)`
3. Bridge looks up the pending socket, writes the provider-shaped reply, closes
4. Bridge emits a `permission_resolved` event so the activity log can update

## IPC sender-frame guard

`safeHandle()` wraps every IPC handler in `src/main/index.ts`:

```ts
if (event.sender !== expected || event.senderFrame !== expected.mainFrame) {
  throw new Error(`[realmkeeper] ipc rejected: untrusted sender for ${channel}`);
}
```

Prevents an injected iframe (from a rendering bug, malicious markdown, etc.) from reaching `SpawnAgent`, `InstallHooks`, `SaveSettings`, `ResolvePermission`, etc.

## Synthetic-wrapper stripping (Claude)

Claude's `UserPromptSubmit` payload often includes injected `<system-reminder>`, `<command-message>`, etc. tags wrapping the user's actual text — these are tooling artifacts the user didn't type. Two helpers in `hook-bridge.ts`:

```ts
stripSyntheticWrappers(text)   // remove <tag>...</tag> blocks for known wrapper tags
isSyntheticUserPrompt(text)    // true if NOTHING remains after stripping
```

Used during normalization of Claude's `UserPromptSubmit`:

- `isSyntheticUserPrompt(...)` is true → drop the event entirely (it's a system probe, not a real prompt)
- Otherwise → emit `user_prompt` with `stripSyntheticWrappers(...)` as the visible text

Don't filter on `text.startsWith("<system-reminder>")` — King prompts can have system-reminders APPENDED, which shouldn't drop the real text. Stripping + checking what's LEFT is the correct heuristic.

## Troubleshooting

- **Bridge silent**: check `~/.realmkeeper/realmkeeper.sock` exists and is a socket. Send a test payload from a shell with `python3 -c "import socket,json; s=socket.socket(socket.AF_UNIX); s.connect('/Users/ed/.realmkeeper/realmkeeper.sock'); s.sendall(json.dumps({'hook_event_name':'SessionStart','session_id':'probe','cwd':'/tmp','__rw_tool':'codex'}).encode())"`. Per-event bridge logs require `REALMKEEPER_DEBUG_BRIDGE=1`.
- **Event not reaching renderer**: confirm the bridge logged it. If it did, the renderer side is wrong.
- **Event arrived but no wielder**: check the sessionId attribution — Cursor in particular uses different identifiers (process sessionId vs chatId; see [`../providers/cursor.md`](../providers/cursor.md)).
