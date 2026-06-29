# Plan: Cursor agent hardening

> **Status:** ✅ Implemented
> **Owner:** Realmkeeper
> **Drafted:** 2026-06-26 · **Last updated:** 2026-06-29 (reconciled autonomy disclosure and identity diagnostics)
> **Engineer profile:** Senior TypeScript engineer comfortable with CLI streams and provider-specific permission models; read `.docs/providers/cursor.md`, `src/main/adapters/cursor-cli.ts`, `src/main/cursor-hook-installer.ts`, and `src/main/adapters/cli-streams.test.ts` first
> **Effort:** 3 PRs, medium
> **Scope:** Cursor headless start/resume reliability, stream fixtures, and explicit observe-only permissions · **Origin:** provider CLI hardening
> **Related:** [provider parity](../provider-cli-hardening/), [Claude](../claude-cli-hardening/), [Codex](../codex-app-server-hardening/), [Gemini](../gemini-cli-hardening/)

## TL;DR

Cursor can match the start/resume/stream/doc/probe parts of provider parity, but not actionable external permission parity. Observed Cursor sessions stay informational because Cursor's native allowlist UI owns the decision; Realmkeeper-started `--force --trust` sessions need a visible autonomy setting before that behavior is treated as product-ready.

## Current Path

- Active start: `cursor-agent create-chat`, then `cursor-agent --print --output-format stream-json --force --trust --resume <chatId> "<prompt>"`
- Resume: `cursor-agent --print --output-format stream-json --resume <chatId> "<prompt>"`
- Permissions: observation-only cards for native/observed flows; Realmkeeper-owned force sessions rely on Cursor's CLI flags rather than an external callback

## Decision

- ✅ Keep observed Cursor permissions as observe-only. `beforeShellExecution` can return `ask`, but Cursor's default allowlist mode still requires the user to decide in Cursor's UI.
- ✅ Keep Realmkeeper-originated active/resume turns on print-mode stream JSON because `--print --resume` strips most hooks and stdout is the reliable event path.
- ✅ Keep `create-chat` before active start so Realmkeeper knows the persistent `chatId` before events arrive.
- ✅ Do not claim session-id parity. Cursor hook `sessionId` and persistent `chatId` are different identifiers except in the print-resume exception.
- ✅ Make `--force --trust` a visible setting or launch-time warning before treating autonomous Cursor wielders as stable product behavior.
- ✅ Keep `--auto-review`, `--sandbox`, `--approve-mcps`, `--mode`, `--model`, and `--stream-partial-output` as tested launch options; defaults stay unchanged until live fixtures show safe behavior.

## PR sequence

1. **Cursor stream fixtures** — ✅ implemented: live active and resumed `stream-json` turns emitted `system/init`, `user`, shell `tool_call` started/completed, final `assistant`, and `result` events; regression coverage ignores started/init noise and normalizes completed tools/results.
2. **Autonomy disclosure** — ✅ implemented: the dispatch UI and provider docs disclose Realmkeeper-started `--force --trust`; observed approvals remain native-UI/observe-only.
3. **Identity reconciliation** — ✅ implemented: Cursor events include diagnostic payload metadata for raw `cursorChatId` / `providerConversationId` and `providerSessionId` when exposed, while resume keeps stripping Realmkeeper's `cursor-` routing prefix before calling the CLI.

## Acceptance gate

- Adapter tests cover Cursor active/resume launch args and every supported optional flag.
- Stream fixtures prove assistant, shell/edit, and completion events render for Realmkeeper-originated Cursor turns without relying on stripped hooks.
- Observe-only letters cannot be mistaken for enforceable allow/deny actions.
- Provider docs explain `sessionId` vs `chatId`, diagnostic identity payloads, `--print --resume` hook stripping, and the autonomy setting.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` pass.

## Probes

- [Provider CLI capability snapshot](../provider-cli-hardening/probes/provider-cli-capability-2026-06-26.md)
- [Cursor active/resume stream fixture](probes/cursor-active-resume-stream-fixture-2026-06-29.md)

## Coverage gaps — what this does NOT validate

- No public Cursor contract currently lets Realmkeeper enforce observed-session permissions externally.
- Some older Cursor hook payloads may omit `conversation_id`; those remain unmergeable without a provider-side chat lookup.
- Cursor IDE attach/input automation is out of scope; Realmkeeper can append turns through CLI resume, not drive the IDE input box.
- Cursor cloud worker/private plugin surfaces are documented but not part of Realmkeeper parity yet.
