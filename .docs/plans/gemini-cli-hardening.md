# Plan: Gemini CLI hardening

**Status**: in progress 2026-06-26 · **Owner**: Realmkeeper · **Phase**: provider reliability

## Goal

Use Gemini CLI's current project configuration and diagnostics features to make Realmkeeper-spawned and resumed Gemini sessions more predictable.

## Current Path

- Active start with Realmkeeper gate installed: `gemini --prompt "<prompt>" --output-format stream-json --approval-mode yolo --skip-trust --session-id <uuid>`
- Resume with Realmkeeper gate installed: `gemini --prompt "<prompt>" --output-format stream-json --approval-mode yolo --skip-trust --resume <uuid>`
- Active/resume without the fail-closed Realmkeeper gate: same stream-json launch, but `--approval-mode default` instead of `yolo`
- Permissions: hook bridge with actionable allow/deny

## Latest Features To Leverage

- Project `.gemini/settings.json` for repo-local defaults.
- MCP `allowMCPServers`, `excludeMCPServers`, `includeTools`, and `excludeTools` for provider-scoped tool control.
- Policy files via `--policy` and `--admin-policy`; local help now marks `--allowed-tools` as deprecated in favor of the policy engine.
- User-level policy files in `~/.gemini/policies/*.toml`; public policy docs currently warn that workspace `.gemini/policies` are disabled.
- `checkpointing.enabled` for restoreable file and conversation state during risky tasks.
- `sandbox` and `GEMINI_SANDBOX` for tool execution isolation.
- `summarizeToolOutput` for noisy shell output.
- `telemetry` with `logPrompts: false` for local diagnostics without leaking prompt text.

## Work Items

- Add a Gemini capability probe under `probes/` that captures `gemini --help`, current settings behavior, and stream-json schema. Version/help snapshot recorded in [provider CLI capability snapshot](probes/provider-cli-capability-2026-06-26.md); policy/settings dry run remains open.
- Keep the adapter's launch contract testable for current CLI flags. Done for `--policy`, `--admin-policy`, `--include-directories`, `--sandbox`, `--model`, and `--skip-trust`.
- Decide whether Realmkeeper should generate a `.gemini/settings.json` template or only document a recommended one.
- Add tests for hook payloads produced by current Gemini approval events.
- Keep `--approval-mode yolo` only behind the installed fail-closed Realmkeeper `BeforeTool` gate; fall back to `default` when the gate or managed policy is missing.
