# Adding a new provider

This is the checklist for integrating a new CLI agent (or any other event-emitting tool). The "happy path" is a CLI tool with a hook system; we'll cover that first, then degraded fallbacks.

## Decision tree

```
Does the provider have a hook system?
├── Yes → preferred path. Go to "Hook-based provider" below.
└── No  → fallback to transcript polling. Go to "Transcript-only provider".

Does the provider expose assistant-response text via a hook?
├── Yes → done after hook installer + bridge normalizer (e.g. Cursor's afterAgentResponse).
└── No  → also need a transcript watcher (Claude/Codex pattern).

Does the provider support session resume from a one-shot CLI?
├── Yes → can be driven from realmkeeper after spawn.
└── No  → Realmkeeper is observation-only for that provider.
```

## Hook-based provider — minimum surface

Concretely, here's what touches what:

| File | Add | Purpose |
|---|---|---|
| `src/main/<name>-hook-installer.ts` | new | Read provider config, splice in `bin/realmkeeper-hook` invocations, idempotent install/uninstall |
| `bin/realmkeeper-hook` | edit | Branch on `hook_event_name` if the provider uses unusual names. Use a `--tool <name>` argv flag if event names collide with an existing tool |
| `src/main/adapters/hook-bridge.ts` | edit | Add a `normalize<Name>Payload(p, eventName)` and route from the dispatcher (case detection or `__rw_tool` marker). Add tool-name canonicalization entries if the provider uses non-standard names. Detail in [`../architecture/bridge.md`](../architecture/bridge.md) |
| `src/shared/ipc.ts` | edit | Add `Install<Name>Hooks` / `Uninstall<Name>Hooks` / `<Name>HooksStatus` IPC channels |
| `src/main/index.ts` | edit | Wire the new IPC handlers via `safeHandle` |
| `src/renderer/src/ui/Settings*.tsx` | edit | Add the install/uninstall toggle |

## Transcript-only provider (no afterAgentResponse hook)

In addition to the above:

| File | Add | Purpose |
|---|---|---|
| `src/main/adapters/<name>-transcript.ts` | new | Long-lived poller (every ~2s) over the provider's on-disk session files, emits synthetic `assistant_text` events. See `claude-transcript.ts` and `codex-transcript.ts` for the pattern |
| `src/main/index.ts` | edit | Start/stop the watcher in `app.whenReady()` and `will-quit` |

The watcher pattern:
1. `listSessionFiles()` — find candidate files
2. For each new file, register at **current size** (don't replay history)
3. On each tick, read appended bytes per file, split lines, parse JSON, emit events
4. Track `state.size` per file; reset to 0 if the file shrinks (rotation)
5. Track an `emittedItemIds: Set<string>` for safety against re-scans

## Resume support (driving observed sessions)

If the provider's CLI supports a non-interactive resume:

| File | Add | Purpose |
|---|---|---|
| `src/main/adapters/<name>-cli.ts` | new fn | `resume<Name>Session(sessionId, cwd, prompt)` — spawns the one-shot CLI invocation. The hooks installed earlier do the work of streaming events back |
| `src/main/agent-manager.ts` | edit | Dispatch `SendPrompt` to the resume function when `unit.spawnedHere === false` |
| `src/renderer/src/ui/WielderChatInput.tsx` | edit | Pass `sessionId`, `tool`, and `cwd` with `SendPrompt` so main can resume observed units |

If `--print --resume` strips hooks (Cursor's case), additionally:
- Parse the assistant text from stdout
- Synthesize `source: "realmkeeper"` events directly into the bus, attributed to the chat/session id

## What you can skip (DO NOT add unless needed)

- A separate Pending map per tool — the bridge's existing one is generic
- A new event kind — reuse `AgentEvent.kind` values; add a new kind only if the existing taxonomy genuinely doesn't cover it
- A new IPC channel for events — `IPC.EventStream` is the bus for everything
- Provider-specific renderer components — the chat stream is tool-agnostic; tool nuances belong in the bridge normalizer

## Testing

- **Fixture replay**: write a JSONL of recorded events, register it in `src/main/adapters/fixture.ts`, replay via `IPC.PlayFixture`. Lets you iterate on UI without firing real provider sessions.
- **Manual smoke**: install hooks, open a session in the provider, watch the bridge log (`/tmp/realmkeeper-dev.log` in dev) for `[realmkeeper/bridge] hook <Event> sid=...` lines.
- **Empirical resume verification**: snapshot the on-disk transcript before and after a `--print --resume`; diff to confirm no fork (see [`claude.md`](./claude.md) § Resume for the procedure).

## Documentation requirement

When you add a provider, **add a `<name>.md` in this directory** following the existing template:
- Binary & install
- Hook events (with table)
- Transcript persistence (paths, format)
- Resume command + verification
- Gaps & quirks (the section that ages best — write everything weird you discovered)
