# Plan: Claude CLI hardening

> **Status:** 📋 Plan
> **Owner:** Realmkeeper
> **Drafted:** 2026-06-26 · **Last updated:** 2026-06-28 (implemented Claude diagnostics)
> **Engineer profile:** Senior TypeScript engineer comfortable with CLI streams and hook payloads; read `.docs/providers/claude.md`, `src/main/adapters/claude-cli.ts`, `src/main/adapters/claude-transcript.ts`, and `src/main/adapters/cli-streams.test.ts` first
> **Effort:** 3 PRs, small-to-medium
> **Scope:** Claude start/resume stream reliability, permission hooks, and deferred user-interaction fixtures · **Origin:** provider CLI hardening
> **Related:** [provider parity](../provider-cli-hardening/), [Codex](../codex-app-server-hardening/), [Cursor](../cursor-agent-hardening/), [Gemini](../gemini-cli-hardening/)

## TL;DR

Claude already has the provider basics: Realmkeeper can start and resume print-mode turns, observe stream output, and enforce permission requests through the hook bridge. Parity work should keep rich stream metadata off by default, add fixtures for deferred user-interaction tools, and only turn on partial-message rendering after the renderer has an explicit transient path.

## Current Path

- Active start: `claude -p "<prompt>" --output-format stream-json --verbose`
- Resume: `claude -p "<prompt>" --output-format stream-json --verbose --resume <session>`
- Permissions: hook bridge with actionable allow/deny

## Decision

- ✅ Keep print-mode stream JSON as the default active/resume path. It is already covered by the adapter and avoids adding another long-lived provider protocol.
- ✅ Keep `--include-hook-events`, `--include-partial-messages`, and `--prompt-suggestions` as tested opt-in launch args, not defaults. The rich-stream probe shows extra `system`, `stream_event`, and `rate_limit_event` records; `normalizeStreamMessage()` correctly ignores them until the UI intentionally renders partials.
- ✅ Keep the hook bridge as the actionable permission path. `--permission-prompt-tool` remains a probe candidate, but it does not replace socket-backed hooks until it can cover the same allow/deny card flow.
- ✅ Do not use `--fork-session`, `--bg`, or background-agent discovery as default behavior. They need explicit UI concepts for branches/background workers before they can be parity features.
- ✅ Treat deferred user interaction (`AskUserQuestion`/resume updated input) as the next Claude-specific parity ticket because it maps to Realmkeeper letters.

## PR sequence

1. **Deferred question fixtures** — capture or synthesize Claude `AskUserQuestion`/updatedInput payloads, normalize them into answer letters, and add bridge tests.
2. **Partial rendering decision** — if product wants smoother streaming, render `stream_event` content deltas transiently without persisting them as final `assistant_text`; otherwise keep the flags off and document why.
3. **Claude diagnostics** — ✅ implemented: the Connection tab reports Claude version when available, hook install/config status, transcript watcher path/polling, and rich-stream flag defaults.

## Acceptance gate

- Unit tests prove the default Claude launch args stay stable and opt-in rich-stream flags are accepted.
- Rich-stream fixture types remain either explicitly ignored or explicitly rendered; no unknown rich-stream event silently becomes a broken conversation item.
- Deferred user-interaction payloads render as letters and return provider-shaped answers, or are documented as unsupported with fail-closed behavior.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` pass.

## Probe Finding

- `--include-hook-events` emits `system` records with hook lifecycle subtypes.
- `--include-partial-messages` emits `stream_event` records with nested Anthropic streaming event types such as `message_start`, `content_block_start`, and `content_block_delta`.
- `--prompt-suggestions` did not emit a suggestion for the minimal no-tool probe turn.
- The current loose stream parser accepts those event types and `normalizeStreamMessage()` ignores them, so the flags are safe to probe but should remain off by default until the renderer has an explicit transient partial-message path.

## Probes

- [Provider CLI capability snapshot](../provider-cli-hardening/probes/provider-cli-capability-2026-06-26.md)
- [Claude rich stream probe](probes/claude-rich-stream-probe-2026-06-26.md)

## Coverage gaps — what this does NOT validate

- No live fixture yet proves the deferred user-interaction resume/update loop end to end.
- Background agents and forked sessions are intentionally out of scope until Realmkeeper has UI for those concepts.
- Claude native permission prompts may still race with Realmkeeper's hook-backed prompt; the plan preserves the documented behavior rather than hiding it.
