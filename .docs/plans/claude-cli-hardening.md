# Plan: Claude CLI hardening

**Status**: planned 2026-06-25 · **Owner**: Realmkeeper · **Phase**: provider reliability

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
- Deferred user-interaction tools, especially `AskUserQuestion`, using the documented resume-and-updatedInput loop.
- Background sessions in the resume picker and whether any stable non-interactive metadata can identify them.

## Work Items

- Add a Claude capability probe under `probes/` that snapshots `claude --help` and a short non-interactive stream-json run.
- Extend hook tests for deferred tool/user-question payloads.
- Decide whether partial messages should be stored as events or only rendered transiently.
- Keep `--fork-session` out of the default path unless Realmkeeper adds explicit branch/fork UI.
