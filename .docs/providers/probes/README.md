# Provider Probes

Dated empirical checks for provider CLI behavior. These are not active
implementation plans; they are evidence records used by the provider docs.

## Shared

| Probe | Finding |
|---|---|
| [provider-cli-capability-2026-06-26.md](./provider-cli-capability-2026-06-26.md) | Current CLI surfaces support Codex app-server, Gemini policy-aware launches, Claude richer stream flags, and Cursor observe-first defaults. |

## Claude

| Probe | Finding |
|---|---|
| [claude-rich-stream-probe-2026-06-26.md](./claude/claude-rich-stream-probe-2026-06-26.md) | Rich stream flags emit parseable metadata; keep default-off until transient partial rendering exists. |
| [claude-ask-user-question-live-2026-06-29.md](./claude/claude-ask-user-question-live-2026-06-29.md) | `--tools AskUserQuestion` did not expose the tool in print mode. |
| [claude-brief-sendmessage-live-2026-06-29.md](./claude/claude-brief-sendmessage-live-2026-06-29.md) | `--brief` exposes `SendMessage`, but it targets named agents, not the human user. |

## Codex

| Probe | Finding |
|---|---|
| [codex-app-server-2026-06-25.md](./codex/codex-app-server-2026-06-25.md) | App-server schema supports thread lifecycle, approvals, user input, and MCP elicitations. |
| [codex-app-server-live-probe-2026-06-26.md](./codex/codex-app-server-live-probe-2026-06-26.md) | Live command approval round trip completed with the expected acceptance shape. |
| [codex-input-letters-smoke-2026-06-26.md](./codex/codex-input-letters-smoke-2026-06-26.md) | Fixture smoke covers user-input and typed MCP answer letters. |

## Cursor

| Probe | Finding |
|---|---|
| [cursor-active-resume-stream-fixture-2026-06-29.md](./cursor/cursor-active-resume-stream-fixture-2026-06-29.md) | Active/resume print streams emit enough event data for Realmkeeper, while permissions remain observe-only. |

## Gemini

| Probe | Finding |
|---|---|
| [gemini-policy-dry-run-2026-06-26.md](./gemini/gemini-policy-dry-run-2026-06-26.md) | `hooksConfig.enabled: false` disables hooks, so Realmkeeper must fall back from gated `yolo`. |
| [gemini-auth-status-2026-06-29.md](./gemini/gemini-auth-status-2026-06-29.md) | Cached OAuth reached auth but failed for the cached account/tier; live policy execution still needs supported auth. |
