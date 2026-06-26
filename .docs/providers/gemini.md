# Gemini CLI (CLI: `gemini`)

## Binary & Install

- Binary: `gemini` (verified locally 2026-06-25 at `/opt/homebrew/bin/gemini`, version `0.47.0`)
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
gemini --prompt "<prompt>" --output-format stream-json --approval-mode yolo --skip-trust --session-id <uuid>
gemini --prompt "<follow-up>" --output-format stream-json --approval-mode yolo --skip-trust --resume <session-id>
```

The CLI help emphasizes `--resume latest` or numeric indexes, but the bundled `SessionSelector` also accepts full UUIDs. Realmkeeper now generates the UUID up front and passes it with `--session-id`, so new Gemini wielders can be registered immediately instead of waiting for the first `init.session_id` stream event.

Realmkeeper-spawned Gemini processes also set `REALMKEEPER_GEMINI_FAIL_CLOSED=1`. That makes the hook deny `BeforeTool` if the GUI/socket is unavailable, so `--approval-mode yolo` is only used behind Realmkeeper's own gate.

If the adapter cannot verify both the fail-closed `BeforeTool` hook and the managed policy file, it launches with `--approval-mode default` instead of `yolo`. That keeps headless starts usable for read-only/default-policy work without silently auto-running tools outside Realmkeeper's gate.

The gate also checks `hooksConfig.enabled`. If a user globally disables Gemini hooks, Realmkeeper treats Gemini as not installed even if the hook entries and managed policy file are still present, and spawned sessions fall back to `--approval-mode default`.

## 2026-06-25 CLI notes

Local `gemini --help` exposes:

- `--prompt`, `--prompt-interactive`, `--resume`, `--session-id`, and `--output-format text|json|stream-json` for headless and interactive-start turns.
- `--approval-mode default|auto_edit|yolo|plan`, plus `--policy` and `--admin-policy`.
- `--allowed-tools` is still present but deprecated in favor of the policy engine.
- `--acp` for Agent Client Protocol mode.
- `--list-sessions` for session discovery/diagnostics.
- `gemini hooks`, `gemini skills`, and the interactive `/hooks` and `/skills` commands for inspecting hook/skill status.
- `--include-directories` and `--worktree` for broader workspace or isolated-worktree launches.

Official hook docs emphasize that hook scripts must log to stderr and write only the final JSON decision/output to stdout. They also document structured `BeforeTool` denial via `{"decision":"deny","reason":"..."}`, which matches Realmkeeper's fail-closed permission gate.

Policy-engine note: current public docs warn that workspace `.gemini/policies` are disabled, so Realmkeeper should use user/admin policy paths or Realmkeeper-local rules rather than relying on repo-local policy files.

Near-term leverage: use `--list-sessions` for diagnostics in the Connection tab, surface the managed policy path in UI, and explore generated `--policy`/`--admin-policy` files so Realmkeeper's Gemini policy can be audited instead of being a hidden installer detail. ACP is worth a separate spike only if we want a long-lived Gemini transport; the current `--prompt`/`--resume` path is simpler and works.

## Permission Flow

Gemini has two permission-adjacent hooks:

- `BeforeTool` is synchronous and can return `{"decision":"deny","reason":"..."}` before the tool executes. Realmkeeper blocks on this hook and renders allow/deny letters. Deny prevents execution. Allow advances past the hook.
- `Notification` with `notification_type: "ToolPermission"` is observation-only. Realmkeeper forwards it for completeness, returns `{}` immediately, and intentionally does not render an ack card because Gemini ignores decision fields for this hook.

Tradeoff: `BeforeTool` fires for every tool call, not only actions that Gemini would natively prompt for. This is intentionally noisier than Claude's `PermissionRequest`, but it is the only hook where Realmkeeper can deny before execution.

Installer detail: `BeforeTool` uses a long hook timeout so the approval card can wait for a human decision. Observation hooks keep a short timeout. The managed hook command includes `REALMKEEPER_GEMINI_FAIL_CLOSED=1`, and the installer writes `~/.gemini/policies/realmkeeper-managed.toml` to auto-allow Gemini's native policy prompt after Realmkeeper has already gated the tool.

Running Gemini processes read hook settings when they start. After changing hook timeout or command behavior, restart any already-open `gemini` terminal session; otherwise it may keep the old timeout and kill the hook before Realmkeeper can answer.

If `hooksConfig.enabled` is set to `false`, Gemini will skip all hooks. Realmkeeper should not use `--approval-mode yolo` in that state because the managed policy may still suppress Gemini's native prompts while the fail-closed Realmkeeper hook is not running.

## Subagents

Gemini CLI 0.47.0 has built-in/custom subagents and a `gemini skills` surface. The main agent invokes subagents through `invoke_agent` with an `agent_name` and `prompt`; Realmkeeper canonicalizes that tool as `Agent`. Gemini stores subagent transcripts under `.../chats/<parentSessionId>/<childSessionId>.jsonl`, so the bridge uses `transcript_path` to attach child sessions to the parent when hook events include that path.

## Gaps & Quirks

- Auth is required before `gemini --list-sessions` or active spawn works. Without `security.auth.selectedType` or `GEMINI_API_KEY`/Vertex/GCA env, Gemini exits before streaming `init`.
- Headless launches in an untrusted repo exit before hooks fire unless the repo is trusted or the command uses `--skip-trust`.
- Antigravity sessions are out of scope for this CLI hook surface.
- Hook stdout must be JSON. Empty stdout is acceptable for Claude/Codex but not for Gemini.
