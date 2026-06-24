# Gemini CLI (CLI: `gemini`)

## Binary & Install

- Binary: `gemini` (verified locally at `/opt/homebrew/bin/gemini`, version `0.40.1`)
- Settings: `~/.gemini/settings.json` (hooks live under `hooks.<EventName>`)
- Managed policy: `~/.gemini/policies/realmkeeper-managed.toml`
- Install hooks via the realmkeeper Connection tab or `installGeminiHooks()` in `src/main/gemini-hook-installer.ts`

## Hook Events

PascalCase event names. We install these:

| Event | Direction | Purpose |
|---|---|---|
| `SessionStart` | no-op JSON + forward | CLI startup, resume, or clear |
| `SessionEnd` | no-op JSON + forward | CLI exit or clear |
| `BeforeAgent` | no-op JSON + forward | User submitted a prompt |
| `BeforeModel` | no-op JSON + forward | LLM request lifecycle; ignored by bridge to avoid noise |
| `BeforeToolSelection` | no-op JSON + forward | Tool-selection lifecycle; ignored by bridge |
| `BeforeTool` | bidirectional + forward | Tool about to run; Realmkeeper permission gate |
| `AfterTool` | no-op JSON + forward | Tool finished |
| `AfterModel` | no-op JSON + forward | Fires per output chunk; ignored by bridge to avoid duplicate text |
| `AfterAgent` | no-op JSON + forward | Final assistant response for the turn |
| `PreCompress` | no-op JSON + forward | Context-compression advisory |
| `Notification` | no-op JSON + forward | Native permission alert visibility; dropped by bridge |

Payload shape (excerpt):

```json
{
  "hook_event_name": "BeforeTool",
  "session_id": "<uuid>",
  "cwd": "/Users/ed/Github/foo",
  "tool_name": "run_shell_command",
  "tool_input": { "command": "bun test" }
}
```

Gemini expects hook commands to write structured JSON to stdout even when the hook is a no-op, so `bin/realmkeeper-hook --tool gemini` forwards to the socket and writes `{}`. If a hook payload ever omits `session_id` or `cwd`, the script backfills from Gemini's documented `GEMINI_SESSION_ID` and `GEMINI_CWD` hook env vars before forwarding.

## Assistant Text

Gemini's `AfterAgent` hook includes `prompt_response`, so there is no transcript watcher for Gemini. Active spawns also stream assistant deltas through `--output-format stream-json`; `src/main/adapters/gemini-cli.ts` buffers those deltas into one `assistant_text` event per turn segment.

A transcript fallback would be a resilience layer that tails Gemini's on-disk session JSONL if hooks are disabled, missed by an already-running CLI, or changed upstream. It is not required for the current hook path.

## Resume And Spawn

```bash
gemini --prompt "<prompt>" --output-format stream-json --approval-mode yolo
gemini --prompt "<follow-up>" --output-format stream-json --approval-mode yolo --resume <session-id>
```

The CLI help emphasizes `--resume latest` or numeric indexes, but the bundled `SessionSelector` also accepts the full UUID emitted in the `init.session_id` stream event. Realmkeeper uses that UUID for follow-up prompts.

Realmkeeper-spawned Gemini processes also set `REALMKEEPER_GEMINI_FAIL_CLOSED=1`. That makes the hook deny `BeforeTool` if the GUI/socket is unavailable, so `--approval-mode yolo` is only used behind Realmkeeper's own gate.

## Permission Flow

Gemini has two permission-adjacent hooks:

- `BeforeTool` is synchronous and can return `{"decision":"deny","reason":"..."}` before the tool executes. Realmkeeper blocks on this hook and renders allow/deny letters. Deny prevents execution. Allow advances past the hook.
- `Notification` with `notification_type: "ToolPermission"` is observation-only. Realmkeeper forwards it for completeness, returns `{}` immediately, and intentionally does not render an ack card because Gemini ignores decision fields for this hook.

Tradeoff: `BeforeTool` fires for every tool call, not only actions that Gemini would natively prompt for. This is intentionally noisier than Claude's `PermissionRequest`, but it is the only hook where Realmkeeper can deny before execution.

Installer detail: `BeforeTool` uses a long hook timeout so the approval card can wait for a human decision. Observation hooks keep a short timeout. The managed hook command includes `REALMKEEPER_GEMINI_FAIL_CLOSED=1`, and the installer writes `~/.gemini/policies/realmkeeper-managed.toml` to auto-allow Gemini's native policy prompt after Realmkeeper has already gated the tool.

Running Gemini processes read hook settings when they start. After changing hook timeout or command behavior, restart any already-open `gemini` terminal session; otherwise it may keep the old timeout and kill the hook before Realmkeeper can answer.

## Subagents

Gemini CLI 0.40.1 has built-in and custom subagents. The main agent invokes them through `invoke_agent` with an `agent_name` and `prompt`; Realmkeeper canonicalizes that tool as `Agent`. Gemini stores subagent transcripts under `.../chats/<parentSessionId>/<childSessionId>.jsonl`, so the bridge uses `transcript_path` to attach child sessions to the parent when hook events include that path.

## Gaps & Quirks

- Auth is required before `gemini --list-sessions` or active spawn works. Without `security.auth.selectedType` or `GEMINI_API_KEY`/Vertex/GCA env, Gemini exits before streaming `init`.
- Headless launches in an untrusted repo exit before hooks fire unless the repo is trusted or the command uses `--skip-trust`.
- Antigravity sessions are out of scope for this CLI hook surface.
- Hook stdout must be JSON. Empty stdout is acceptable for Claude/Codex but not for Gemini.
