# Plan: Claude CLI hardening

**Status**: in progress 2026-06-26 · **Owner**: Realmkeeper · **Phase**: provider reliability

## Goal

Keep Claude's adapter aligned with the current CLI so Realmkeeper can start, resume, observe, and approve Claude turns with less transcript scraping.

## Current Path

- Active start: `claude -p "<prompt>" --output-format stream-json --verbose`
- Resume: `claude -p "<prompt>" --output-format stream-json --verbose --resume <session>`
- Permissions: hook bridge with actionable allow/deny

## Latest Features To Probe

- `--permission-prompt-tool` for programmatic permission decisions in non-interactive mode.
- `--include-hook-events` to see whether hook lifecycle events can reduce local socket dependency.
- `--include-partial-messages` for smoother streaming in the conversation drawer.
- `--prompt-suggestions` as optional follow-up suggestions after a completed turn.
- `--brief` / `SendUserMessage` as a possible user-interaction surface.
- `--bg` and `claude agents` as a possible background-agent discovery surface.
- Deferred user-interaction tools, especially `AskUserQuestion`, using the documented resume-and-updatedInput loop.
- Background sessions in the resume picker and whether any stable non-interactive metadata can identify them.

## Work Items

- Add a Claude capability probe under `probes/` that snapshots `claude --help` and a short non-interactive stream-json run. Version/help snapshot recorded in [provider CLI capability snapshot](../provider-cli-hardening/probes/provider-cli-capability-2026-06-26.md); rich stream fixture recorded in [Claude rich stream probe](probes/claude-rich-stream-probe-2026-06-26.md).
- Keep the adapter's launch contract testable for current stream flags. Done for `--include-hook-events`, `--include-partial-messages`, and `--prompt-suggestions`; defaults remain off because the fixture shows additional stream event types should be explicitly rendered or ignored by design.
- Extend hook tests for deferred tool/user-question payloads.
- Decide whether partial messages should be stored as events or only rendered transiently.
- Keep `--fork-session` out of the default path unless Realmkeeper adds explicit branch/fork UI.

## Probe Finding

- `--include-hook-events` emits `system` records with hook lifecycle subtypes.
- `--include-partial-messages` emits `stream_event` records with nested Anthropic streaming event types such as `message_start`, `content_block_start`, and `content_block_delta`.
- `--prompt-suggestions` did not emit a suggestion for the minimal no-tool probe turn.
- The current loose stream parser accepts those event types and `normalizeStreamMessage()` ignores them, so the flags are safe to probe but should remain off by default until the renderer has an explicit transient partial-message path.
