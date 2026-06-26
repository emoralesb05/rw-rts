# Plan: Cursor agent hardening

**Status**: in progress 2026-06-26 · **Owner**: Realmkeeper · **Phase**: provider reliability

## Goal

Make Cursor sessions reliable inside Realmkeeper while respecting Cursor's native approval UI until the CLI exposes a supported external approval contract.

## Current Path

- Active start: `cursor-agent --print --output-format stream-json "<prompt>"`
- Resume: `cursor-agent --print --output-format stream-json --resume <chatId> "<prompt>"`
- Permissions: observation-only cards that acknowledge Cursor's native UI

## Latest Features To Probe

- Current `cursor-agent --help` output and whether any new flags expose permission callbacks or non-interactive approval policy.
- `--auto-review`, `--sandbox enabled|disabled`, and `--approve-mcps` behavior in headless mode.
- Stream JSON event shape for active and resumed sessions.
- Whether resumed sessions emit enough hook or stream metadata to replace any transcript fallback.
- Whether Cursor agent exposes stable session metadata beyond the chat id Realmkeeper already tracks.

## Work Items

- Add a Cursor capability probe under `probes/` that records version, help, active stream-json, and resume stream-json. Version/help snapshot recorded in [provider CLI capability snapshot](probes/provider-cli-capability-2026-06-26.md); active/resume stream fixtures remain open.
- Keep the adapter's launch contract testable for current headless flags. Done for `--auto-review`, `--sandbox`, `--approve-mcps`, `--mode`, `--model`, and `--stream-partial-output`; defaults remain unchanged until live probes show which combinations preserve stream events and permissions.
- Keep native permission cards in observe mode until an actionable CLI contract exists.
- Add regression fixtures for shell execution, edit execution, and assistant response events.
- Document any observed divergence between Cursor IDE state and Realmkeeper-originated resumed turns.
