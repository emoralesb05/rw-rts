# Plan: Gemini CLI hardening

> **Status:** ✅ Implemented locally; live auth gap documented
> **Owner:** Realmkeeper
> **Drafted:** 2026-06-26 · **Last updated:** 2026-06-29 (confirmed OAuth is configured but account tier is rejected)
> **Engineer profile:** Senior TypeScript engineer comfortable with CLI hooks and policy files; read `.docs/providers/gemini.md`, `src/main/adapters/gemini-cli.ts`, `src/main/gemini-hook-installer.ts`, and `src/main/adapters/gemini-cli-gate.test.ts` first
> **Effort:** 3 PRs, medium
> **Scope:** Gemini stream-json launch, policy diagnostics, hook payload fixtures, and safe approval mode selection · **Origin:** provider CLI hardening
> **Related:** [provider parity](../provider-cli-hardening/), [Claude](../claude-cli-hardening/), [Codex](../codex-app-server-hardening/), [Cursor](../cursor-agent-hardening/)

## TL;DR

Gemini can reach actionable permission parity, but only when Realmkeeper can verify that the fail-closed `BeforeTool` hook and managed policy are installed and hooks are not globally disabled. Policy/settings features should be documented and diagnosable before Realmkeeper writes more Gemini configuration by default.

## Current Path

- Active start with Realmkeeper gate installed: `gemini --prompt "<prompt>" --output-format stream-json --approval-mode yolo --skip-trust --session-id <uuid>`
- Resume with Realmkeeper gate installed: `gemini --prompt "<prompt>" --output-format stream-json --approval-mode yolo --skip-trust --resume <uuid>`
- Active/resume without the fail-closed Realmkeeper gate: same stream-json launch, but `--approval-mode default` instead of `yolo`
- Permissions: hook bridge with actionable allow/deny

## Decision

- ✅ Keep `--approval-mode yolo` only when Realmkeeper verifies the fail-closed hook, the managed policy file, and `hooksConfig.enabled !== false`.
- ✅ Fall back to `--approval-mode default` for missing hooks, missing policy, parse errors, or globally disabled hooks.
- ✅ Do not auto-generate project `.gemini/settings.json` by default. Provide a recommended template/export path first because repo-local settings are user/workspace policy, not app internals.
- ✅ Prefer user/admin policy paths or Realmkeeper-local rules over workspace `.gemini/policies` while public policy docs warn workspace policies are disabled.
- ✅ Treat sandbox/checkpoint/telemetry/summarizeToolOutput as optional launch/config controls, not default behavior changes, until UI makes those tradeoffs visible.

## PR sequence

1. **Hook payload fixtures** — ✅ implemented: `BeforeTool`, `AfterTool`, `AfterAgent`, subagent parent linking, and advisory `Notification/ToolPermission` behavior are covered by bridge tests.
2. **Policy/status diagnostics** — ✅ implemented: hook enabled state, fail-closed hook state, managed policy path/marker, selected launch approval mode, and settings-template export are visible from provider status.
3. **Settings template export** — ✅ implemented: the Connection tab exposes a copyable minimal `.gemini/settings.json` template and provider docs explain that Realmkeeper does not write repo-local Gemini settings automatically.

## Acceptance gate

- Tests prove gated launches use `yolo` and every ungated state uses `default`.
- Tests cover `hooksConfig.enabled: false` for both installer status and adapter launch selection.
- Gemini hook fixtures normalize into permission, tool, assistant, and ignored-notification behavior without duplicate conversation text.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` pass.

## Dry-run Finding

- Gemini's documented `hooksConfig.enabled: false` disables all hooks. Realmkeeper now treats that as "Gemini gate not installed" for both hook status and adapter launch decisions, preventing `--approval-mode yolo` from being selected when the managed allow policy exists but hooks are globally disabled.

## Probes

- [Provider CLI capability snapshot](../provider-cli-hardening/probes/provider-cli-capability-2026-06-26.md)
- [Gemini policy dry run](probes/gemini-policy-dry-run-2026-06-26.md)

## Coverage gaps — what this does NOT validate

- A live Gemini policy execution probe still needs a supported non-interactive auth path. This machine has cached `oauth-personal` auth selected, but 2026-06-29 probes with installed `0.47.0` and npm-latest `0.49.0` both failed with `IneligibleTierError` / `UNSUPPORTED_CLIENT` for the cached Gemini Code Assist individual path. That finding is scoped to the account/tier used by the probe; it does not prove every paid Google sign-in fails. The same pass found no `GEMINI_API_KEY`, `GOOGLE_API_KEY`, Vertex/Google Cloud project env, `GOOGLE_APPLICATION_CREDENTIALS`, `gcloud`, or ADC config, so the next probe needs a throwaway API key, Vertex/GCA env, or a verified supported Google AI Pro/Ultra or Workspace account.
- Workspace policy behavior may change upstream, so user/admin policy guidance must be rechecked after Gemini upgrades.
- The settings template is deliberately minimal; richer Gemini settings remain user/provider configuration until Realmkeeper has UI for those tradeoffs.
