# Gemini CLI (CLI: `gemini`)

## Binary & Install

- Binary: `gemini` (verified locally at `/opt/homebrew/bin/gemini`, version `0.40.1`)
- Settings: `~/.gemini/settings.json` (hooks live under `hooks.<EventName>`)
- Install hooks via the keykeeper Connection tab or `installGeminiHooks()` in `src/main/gemini-hook-installer.ts`

## Hook Events

PascalCase event names. We install these:

| Event | Direction | Purpose |
|---|---|---|
| `SessionStart` | no-op JSON + forward | CLI startup, resume, or clear |
| `SessionEnd` | no-op JSON + forward | CLI exit or clear |
| `BeforeAgent` | no-op JSON + forward | User submitted a prompt |
| `BeforeModel` | no-op JSON + forward | LLM request lifecycle; ignored by bridge to avoid noise |
| `BeforeToolSelection` | no-op JSON + forward | Tool-selection lifecycle; ignored by bridge |
| `BeforeTool` | no-op JSON + forward | Tool about to run |
| `AfterTool` | no-op JSON + forward | Tool finished |
| `AfterModel` | no-op JSON + forward | Fires per output chunk; ignored by bridge to avoid duplicate text |
| `AfterAgent` | no-op JSON + forward | Final assistant response for the turn |
| `PreCompress` | no-op JSON + forward | Context-compression advisory |
| `Notification` | no-op JSON + forward | Tool permission alert visibility |

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

Gemini expects hook commands to write structured JSON to stdout even when the hook is a no-op, so `bin/keykeeper-hook --tool gemini` forwards to the socket and writes `{}`. If a hook payload ever omits `session_id` or `cwd`, the script backfills from Gemini's documented `GEMINI_SESSION_ID` and `GEMINI_CWD` hook env vars before forwarding.

## Assistant Text

Gemini's `AfterAgent` hook includes `prompt_response`, so there is no transcript watcher for Gemini. Active spawns also stream assistant deltas through `--output-format stream-json`; `src/main/adapters/gemini-cli.ts` buffers those deltas into one `assistant_text` event per turn segment.

## Resume And Spawn

```bash
gemini --prompt "<prompt>" --output-format stream-json
gemini --prompt "<follow-up>" --output-format stream-json --resume <session-id>
```

The CLI help emphasizes `--resume latest` or numeric indexes, but the bundled `SessionSelector` also accepts the full UUID emitted in the `init.session_id` stream event. Keykeeper uses that UUID for follow-up prompts.

## Permission Flow

Gemini's `Notification` event with `notification_type: "ToolPermission"` is observation-only. Keykeeper shows an acknowledgement letter, but the allow/deny decision must happen in Gemini's native UI.

We intentionally do not use `BeforeTool` as a permission gate in v1. It fires for every tool call and would create noisy false-positive permission cards.

## Gaps & Quirks

- Auth is required before `gemini --list-sessions` or active spawn works. Without `security.auth.selectedType` or `GEMINI_API_KEY`/Vertex/GCA env, Gemini exits before streaming `init`.
- Headless launches in an untrusted repo exit before hooks fire unless the repo is trusted or the command uses `--skip-trust`.
- Antigravity sessions are out of scope for this CLI hook surface.
- Subagents exist in Gemini CLI, but there is no dedicated keykeeper parent/child normalizer yet. They appear as ordinary tool events for now.
- Hook stdout must be JSON. Empty stdout is acceptable for Claude/Codex but not for Gemini.
