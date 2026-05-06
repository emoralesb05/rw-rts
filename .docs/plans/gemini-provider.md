# Plan: Add Gemini as a fourth provider

**Status**: Phase 1 and Phase 2 implemented · **Owner**: keykeeper · **Phase**: Post-MVP — provider extension

## Goal

Add Google's `gemini` CLI as the fourth observable provider alongside Claude, Cursor, and Codex. Same shape as the existing three: hook installer, bridge normalizer, optional spawn adapter, optional resume support for the [observed-resume](./observed-resume.md) work.

## Why

- The user runs `gemini` in their workflow (verified: `0.40.1` installed locally)
- Gemini CLI's hook system is **directly compatible with Claude's** — `gemini hooks migrate --from-claude` exists as an explicit migration path. Implementation should be cheap.
- Closes the "personal-tidy supports your actual stack" loop: Claude + Cursor + Codex + Gemini = the four current first-class coding agents

## What we know (verified 2026-05-01 from CLI + docs)

### Hook surface (11 events, 4 categories)

| Concept | Gemini event | Notes |
|---|---|---|
| Session start | `SessionStart` | payload: `{source: "startup" \| "resume" \| "clear"}` — fires on resume too |
| Session end | `SessionEnd` | payload: `{reason: "exit" \| "clear" \| "logout" \| ...}` |
| User prompt | `BeforeAgent` | payload: `{prompt: string}` |
| Tool about to run | `BeforeTool` | payload: `{tool_name, tool_input, mcp_context?}` — bidirectional, can `decision: "deny"` |
| Tool finished | `AfterTool` | payload: `{tool_response: {llmContent, returnDisplay, error?}}` |
| Per-turn done | `AfterAgent` | **payload includes `prompt_response: string` — assistant text comes through here** |
| Permission ask | `Notification` (`notification_type: "ToolPermission"`) | OBSERVATIONAL only — no decision response accepted |
| Model hooks | `BeforeModel`, `BeforeToolSelection`, `AfterModel` | low-level LLM request lifecycle, not needed for keykeeper |
| Compress | `PreCompress` | history-compression event, not needed |

**Big win**: Gemini's `AfterAgent` carries `prompt_response`, so we get assistant text via hook — **no transcript watcher needed** (unlike Claude/Codex).

### Hook protocol

- stdin JSON in, stdout JSON out (identical pattern to Claude/Codex)
- Hook config in `~/.gemini/settings.json` under `hooks.<EventName>` array (identical structure to Claude — that's why `migrate --from-claude` is one command)
- PascalCase event names (collides with Claude's — bridge dispatcher needs to disambiguate via `__kh_tool` marker, same trick we use for Codex)

### Permission flow caveat

Gemini does NOT have a clean `PermissionRequest` analog (the hook that fires only when permission is needed). Two technical paths, neither great:

- **Option A — `BeforeTool decision: "deny"`** — bidirectional, can block, but fires for EVERY tool call. Same noise problem we hit with Claude `PreToolUse` before switching to `PermissionRequest`. Over-aggressive.
- **Option B — `Notification ToolPermission`** — observational only, fires when Gemini's UI is about to prompt. We can't actually decide via hook.

**Decision**: ship with **Option B (observational, Cursor-style)** — present a letter for awareness, user decides in Gemini's own UI. Reason: matches the Cursor model, no over-eager false-positive permission requests, simpler. Re-evaluate if Gemini ships a true PermissionRequest hook in a later version.

### Session / resume model

- Sessions persist across restarts (verified — `--list-sessions` enumerates them)
- `--resume <index>`, `--resume latest`, or `--resume <session_id>` for non-interactive resume
- **UUID resume works** — Gemini CLI 0.40.1's bundled `SessionSelector` accepts the full `session_id`, even though the help text emphasizes indexes/latest.
- Headless mode: `--prompt "<text>" --output-format stream-json` → JSONL events (init, message, tool_use, tool_result, error, result)
- ACP mode (`--acp`) — JSON-RPC over stdio for IDE integrations. Alternative path if hooks ever get insufficient. Out of scope for v1.

### Subagent

Gemini does not appear to have a subagent concept (no `SubagentStop` analog). Need empirical verification — if Gemini supports tasks/agents, the lack of a hook for them is a gap.

### Session storage

Unverified. `~/.gemini/history/` only has `.project_root` markers per project, not transcripts. Sessions might live in:
- `~/Library/Application Support/gemini-cli/` (macOS standard for Electron-style apps)
- Inside the home dir under a different path
- A SQLite db somewhere

For v1 we don't need to know — hooks cover everything we observe. Only matters if we ever want a transcript-watcher fallback like Claude/Codex have.

### Antigravity (separate consideration)

`~/.gemini/antigravity/` exists — Antigravity is Google's separate IDE product. Antigravity-only sessions probably don't go through `gemini` CLI hooks (different process / different storage). Same situation as Cursor IDE vs cursor-agent CLI — we observe CLI sessions, not IDE-only ones. **Document this gap**.

## Implementation surface

| File | Change |
|---|---|
| `bin/keykeeper-hook` | Edit. Handle Gemini's PascalCase events with `--tool gemini` flag (same disambiguation pattern as Codex). Permission flow: `Notification` event maps to fire-and-forget letter; `BeforeTool` is fire-and-forget too (since we go observational). |
| `src/main/gemini-hook-installer.ts` | **Done.** Installs hooks in `~/.gemini/settings.json` with `--tool gemini` marker. |
| `src/main/adapters/hook-bridge.ts` | **Done.** Adds `normalizeGeminiPayload(p, eventName)` and Gemini tool-name canonicalization. |
| `src/shared/ipc.ts` | **Done.** Adds `InstallGeminiHooks`, `UninstallGeminiHooks`, `GeminiHooksStatus`. |
| `src/main/index.ts` | **Done.** Wires the new IPC handlers via `safeHandle`. |
| `src/renderer/src/ui/floating/KingdomPanelBody.tsx` (Connection tab) | **Done.** Adds Gemini install/uninstall toggle alongside Claude/Cursor/Codex. |
| `src/main/agent-manager.ts` | **Done.** Adds `gemini` to the `SpawnableTool` union and wires `spawnGeminiAgent`. |
| `src/main/adapters/gemini-cli.ts` | **Done.** Active spawn via `gemini --prompt --output-format stream-json`; follow-ups use `--resume <session-id>`. |
| `src/shared/events.ts` | **Done.** `AgentTool` includes `"gemini"`. |
| `.docs/providers/gemini.md` | **Done.** Per-provider doc added. |
| `.docs/providers/hooks.md` | **Done.** Gemini column added to the event coverage matrix. |

Estimated size: ~300 LOC core (installer + bridge normalizer + IPC + tool union) + ~200 LOC for the spawn adapter if we ship that in v1.

## Phasing

**Phase 1 — Observe-only** (~½ day): hook installer, bridge normalizer, Settings toggle, provider doc. Gemini sessions started in any terminal show up in keykeeper. **Implemented.**

**Phase 2 — Active spawn** (~½ day): `spawnGeminiAgent` + dispatch UI integration. User can now launch Gemini from keykeeper's Dispatch dialog. **Implemented.**

**Phase 3 — Resume integration** (covered by [`observed-resume.md`](./observed-resume.md)): once observed-resume ships for Claude/Codex/Cursor, add Gemini support — `gemini --resume <session_id> --prompt "<text>"` is the equivalent.

## Out of scope

- ACP mode (`--acp`) — JSON-RPC integration is heavier than hooks need, defer until hooks prove insufficient
- Antigravity IDE sessions — different storage, no hook surface; flag as a known gap
- True PermissionRequest-equivalent hook — needs Gemini upstream change; track as "would-be-nice" if Google ever adds it
- Bidirectional `BeforeTool` denials — the noise problem outweighs the value

## Edge cases / gaps to flag in the provider doc

- **No subagent hook** (need to verify if Gemini has subagents at all)
- **Permission is observation-only** (Cursor-style)
- **Resume help text is incomplete** — help advertises indexes/latest, but full UUIDs work in 0.40.1.
- **Trusted-folder gate** — fresh headless smoke requires `--skip-trust` or an interactively trusted repo before Gemini reaches hooks.
- **Antigravity sessions are out of scope** for the CLI hook surface
- **Session storage on disk is undocumented** — no transcript-watcher fallback if Gemini ever changes the hook contract

## Testing

- **Manual smoke**: install hooks via Settings → Connection toggle, run `gemini` in a terminal, confirm events flow into keykeeper (session_start, user_prompt, tool_use, tool_result, assistant_text, session_end)
- **External CLI regression**: run the hook script with only `GEMINI_SESSION_ID`/`GEMINI_CWD` env vars and no `session_id` in stdin; confirm the bridge still creates a Gemini wielder.
- **Permission**: trigger a tool that Gemini would prompt for (e.g., a write to a sensitive path), confirm a `Notification` event surfaces a letter in AlertsHUD
- **Cross-tool dispatcher**: confirm Gemini events don't get misrouted to Claude or Codex (PascalCase collision is the risk — `__kh_tool` marker handles it)
- **Spawn (Phase 2)**: trigger a Gemini wielder via Dispatch dialog, confirm `--output-format stream-json` events parse into the bus

## Sequencing with other plans

- Independent of `chat-drawer.md` and `observed-resume.md`
- Ideal order: this Phase 1 (cheap, big visibility win) → `observed-resume` (which then naturally extends to Gemini in Phase 3 of this plan) → `chat-drawer`
