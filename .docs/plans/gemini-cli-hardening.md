# Plan: Gemini CLI hardening

**Status**: planned 2026-06-25 · **Owner**: Realmkeeper · **Phase**: provider reliability

## Goal

Use Gemini CLI's current project configuration and diagnostics features to make Realmkeeper-spawned and resumed Gemini sessions more predictable.

## Current Path

- Active start: `gemini --prompt "<prompt>" --output-format stream-json --approval-mode yolo --session-id <uuid>`
- Resume: `gemini --prompt "<prompt>" --output-format stream-json --approval-mode yolo --resume <uuid>`
- Permissions: hook bridge with actionable allow/deny

## Latest Features To Leverage

- Project `.gemini/settings.json` for repo-local defaults.
- `coreTools` and `excludeTools` to narrow tool availability instead of relying only on prompt guidance.
- MCP `allowMCPServers`, `excludeMCPServers`, `includeTools`, and `excludeTools` for provider-scoped tool control.
- `checkpointing.enabled` for restoreable file and conversation state during risky tasks.
- `sandbox` and `GEMINI_SANDBOX` for tool execution isolation.
- `summarizeToolOutput` for noisy shell output.
- `telemetry` with `logPrompts: false` for local diagnostics without leaking prompt text.

## Work Items

- Add a Gemini capability probe under `probes/` that captures `gemini --help`, current settings behavior, and stream-json schema.
- Decide whether Realmkeeper should generate a `.gemini/settings.json` template or only document a recommended one.
- Add tests for hook payloads produced by current Gemini approval events.
- Revisit `--approval-mode yolo` once the hook path is proven to gate every risky tool call reliably.
