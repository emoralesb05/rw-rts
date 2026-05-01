# Events & transcript watchers

The event bus is the spine of keykeeper. Every observable thing a wielder does — start, prompt, tool call, response, error, end — becomes an `AgentEvent` on the bus, gets shipped to the renderer over `IPC.EventStream`, and lands in the Zustand store as part of `events[]`.

## The happy path (hook-driven)

```
provider hook fires
  → bin/kh-rts-hook
    → bridge socket (~/.claude/kh-rts.sock)
      → hook-bridge.ts normalizes to AgentEvent
        → event-bus.ts dispatches
          → IPC.EventStream → renderer
            → zustand store appends to events[]
              → ConversationStream / KingdomScene react
```

For details on the bridge and dispatch, see [`bridge.md`](./bridge.md).

## The transcript fallback (when assistant text isn't a hook)

Claude and Codex don't fire any `assistant_text` / `afterAgentResponse` hook. To capture their replies we poll their on-disk session files:

```
provider writes JSONL line
  → *-transcript.ts polls and detects new line
    → emits synthetic AgentEvent into bus
      → (rest of pipeline same as above)
```

Cursor's `afterAgentResponse` hook covers it directly, so there's no `cursor-transcript.ts`.

## `AgentEvent` shape

Defined in `src/shared/events.ts`. All events share the envelope; `payload` fields vary by `kind`.

```ts
type AgentEvent = {
  sessionId: string;            // provider's session/thread/chat id
  tool: "claude" | "cursor" | "codex";
  cwd: string;
  repoRoot?: string;            // stamped by main bus before emit; renderer keys worlds by this
  timestamp: number;
  kind: AgentEventKind;
  payload: { /* see per-kind table below */ };
  source: "spawned" | "hook";   // spawned = started by us; hook = observed
}
```

### `payload` shape per kind

| `kind` | Common payload fields |
|---|---|
| `session_start` | (often empty — sessionId+cwd in envelope is enough) |
| `session_end` | `error?: string` if abnormal exit |
| `user_prompt` | `text: string` |
| `assistant_text` | `text: string` |
| `tool_use` | `name: string` (canonicalized), `input: unknown` |
| `tool_result` | `name: string`, `output: unknown`, `error?: string`, `durationMs?: number` |
| `subagent_spawn` | `parentSessionId: string`, `name?: string` (the spawned task's id/role) |
| `error` | `error: string`, optional `name`/`input` if tied to a tool call |
| `permission_request` | `name: string`, `input: unknown`, `requestId: string` (route-back id) |
| `permission_resolved` | `requestId: string`, `resolution?: "error"` (synthetic — emitted when something other than the GUI resolves it) |

`durationMs` on `tool_result` is opportunistic — Cursor reports `duration`, Codex `duration_ms`. When present, the renderer surfaces a small chip on slow tool calls.

Bridge normalizers (one per tool) map provider-specific event names and payloads into this shape. The renderer never sees the raw provider payload.

## Long-lived background workers

Started in `app.whenReady()`, stopped in `will-quit`:

| Worker | What it does |
|---|---|
| `startHookBridge()` | UNIX socket listener (the spine) |
| `startClaudeTranscriptWatcher()` | polls `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` |
| `startCodexTranscriptWatcher()` | polls `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<thread-id>.jsonl` |

Each watcher keeps a `Map<path, FileState>` with `{size, carry, emittedItemIds}`. New files start at current size (don't replay history). On each ~2s tick it reads appended bytes, splits lines, parses JSON, emits events.

## Event ordering

- Within one session, events are ordered by `timestamp`
- Across sessions, no global ordering is guaranteed (clocks may skew, polling intervals stagger)
- The renderer's `interruptedPromptIds` heuristic walks per-session in timestamp order

## Fixture replay (testing)

`src/main/adapters/fixture.ts` lets you replay a recorded scenario as synthetic events on the bus — `source: "fixture"` instead of `"hook"`. Useful for iterating on the renderer without spinning up real provider sessions.

- Built-in scenarios: summon, combat, subagent, permission, etc.
- IPC: `kh:play-fixture` with `{scenario, cwd}` triggers playback
- Synthetic role assignment via archetype hashing — keeps the same prompt → same color across runs

Fixtures emit through the same bus pipeline as hooks; the only differentiator is the `source` field, which the renderer can ignore. Adding a scenario = appending an entry to the fixture map.
