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

- Add a Claude capability probe under `probes/` that snapshots `claude --help` and a short non-interactive stream-json run. Version/help snapshot recorded in [provider CLI capability snapshot](probes/provider-cli-capability-2026-06-26.md); live stream fixture remains open.
- Keep the adapter's launch contract testable for current stream flags. Done for `--include-hook-events`, `--include-partial-messages`, and `--prompt-suggestions`; defaults remain off until fixture captures prove the renderer handling.
- Extend hook tests for deferred tool/user-question payloads.
- Decide whether partial messages should be stored as events or only rendered transiently.
- Keep `--fork-session` out of the default path unless Realmkeeper adds explicit branch/fork UI.
