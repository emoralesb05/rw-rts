# Plan: Provider CLI hardening

**Status**: active 2026-06-25 · **Owner**: Realmkeeper · **Phase**: provider reliability

## Goal

Make every provider adapter use the strongest current integration surface available for:

1. starting sessions from Realmkeeper
2. resuming or interjecting into existing sessions
3. surfacing tool calls and permission requests in the UI
4. keeping docs and probes close enough to rerun after CLI upgrades

## Current version snapshot

| Provider | Installed CLI | Primary active path | Resume/interject path | Permission path |
|---|---:|---|---|---|
| Claude | `2.1.191` | `claude -p --output-format stream-json --verbose` | `--resume` | hook bridge, actionable |
| Codex | `0.142.2` | `codex app-server --stdio` | `thread/resume`, `turn/start`, `turn/steer` | app-server approval requests, actionable |
| Cursor | `2026.06.24-00-45-58-9f61de7` | `cursor-agent --print --output-format stream-json` | `--resume` | native UI observed |
| Gemini | `0.47.0` | `gemini --prompt --output-format stream-json` | `--resume` | hook bridge, actionable |

## Decisions

- Codex should stay on app-server as the default drive path. Official docs describe app-server as the rich-client protocol for authentication, conversation history, approvals, and streamed events; it also supports `thread/start`, `thread/resume`, `turn/start`, and `turn/steer`.
- Claude should stay on print-mode stream JSON for now, but the next probe should cover `--permission-prompt-tool`, `--include-hook-events`, `--include-partial-messages`, and deferred user-interaction tools.
- Gemini should get a project-settings pass. The current CLI supports project `.gemini/settings.json`, `coreTools`, `excludeTools`, MCP allow/exclude controls, sandboxing, checkpointing, telemetry, and shell-output summarization.
- Cursor remains observation-first until the CLI exposes an actionable permission contract equivalent to Claude/Gemini hooks or Codex app-server requests.

## Provider Plans

- [Codex app-server hardening](codex-app-server-hardening.md)
- [Claude CLI hardening](claude-cli-hardening.md)
- [Gemini CLI hardening](gemini-cli-hardening.md)
- [Cursor agent hardening](cursor-agent-hardening.md)

## Test Matrix

- Adapter unit tests for stream normalization, request params, and approval response mapping
- Hook bridge tests for socket-backed and callback-backed permission requests
- Full `bun run test`, `bun run typecheck`, `bun run lint`, and `bun run build`
- App smoke pass with fixture playback and console/error capture under `probes/app-smoke-*`

## References

- Codex app-server docs: https://developers.openai.com/codex/app-server
- Claude CLI reference: https://code.claude.com/docs/en/cli-reference
- Claude hooks reference: https://code.claude.com/docs/en/hooks
- Gemini CLI configuration: https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/configuration.md
