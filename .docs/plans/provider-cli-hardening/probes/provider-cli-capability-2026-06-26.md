# Probe: Provider CLI capability snapshot

**Date:** 2026-06-26
**Scope:** Local CLI help/version plus current public docs for the provider integration surfaces Realmkeeper uses.

## Commands Run

- `claude --version`
- `claude --help`
- `codex --version`
- `codex app-server --help`
- `codex app-server generate-json-schema --experimental --out /private/tmp/rw-codex-schema`
- `gemini --version`
- `gemini --help`
- `cursor-agent --version`
- `cursor-agent --help`

## Findings

### Claude Code

- Installed CLI: `2.1.193 (Claude Code)`.
- Headless stream JSON path remains available through `claude -p --output-format stream-json --verbose`.
- Resume/session pinning remains available through `--resume [value]` and `--session-id <uuid>`.
- Local help exposes integration flags worth probing next, but not enabling by default yet:
  - `--include-hook-events`
  - `--include-partial-messages`
  - `--prompt-suggestions`
  - `--brief`
  - `--bg` / `claude agents`
- Public hook docs confirm `AskUserQuestion` can be deferred in non-interactive mode and resumed with `updatedInput`; this is the right path for Realmkeeper-owned user-question UI.
- Follow-up live probe on 2026-06-29 classified `--brief`: the CLI exposes `SendMessage` in stream JSON, but the tool expects a named Claude agent target and is not a human answer-letter path.

### Codex

- Installed CLI: `codex-cli 0.142.2`.
- `codex app-server --stdio` remains the right local rich-client transport.
- Local help exposes schema generation via `codex app-server generate-ts` and `generate-json-schema`, so future protocol tests should compare Realmkeeper's request handling against a generated schema snapshot.
- Generated experimental schema confirms `item/tool/requestUserInput` params contain `itemId`, `threadId`, `turnId`, optional `autoResolutionMs`, and `questions[]`; response shape is `{ answers: { [questionId]: { answers: string[] } } }`.
- Generated experimental schema confirms `mcpServer/elicitation/request` supports typed `form`, `openai/form`, and `url` modes. Typed `form` uses primitive JSON-schema fields and responds with `{ action: "accept" | "decline" | "cancel", content? }`.
- Public app-server docs confirm:
  - approval requests for command execution and file changes
  - `tool/requestUserInput` for client-side questions
  - experimental dynamic tools through `dynamicTools` plus `item/tool/call`
  - app and MCP listing/call surfaces

### Gemini CLI

- Installed CLI: `0.47.0`.
- Headless stream JSON path remains available through `gemini --prompt --output-format stream-json`.
- Resume/session pinning remains available through `--resume` and `--session-id`.
- Local help confirms `--approval-mode` values: `default`, `auto_edit`, `yolo`, and `plan`.
- Local help now points tool allow-listing toward policy files: `--policy`, `--admin-policy`, and notes `--allowed-tools` is deprecated in favor of the policy engine.
- Public configuration docs confirm project `.gemini/settings.json`, MCP include/exclude tool filters, sandboxing, checkpointing, telemetry with `logPrompts`, and shell-output summarization.
- Public policy docs confirm user policy files in `~/.gemini/policies/*.toml`, `--policy` / `--admin-policy` supplemental paths, and TOML rules with `allow`, `deny`, or `ask_user`. They also warn that workspace `.gemini/policies` are currently disabled, so Realmkeeper should not rely on repo-local policy files yet.

### Cursor Agent

- Installed CLI: `2026.06.24-00-45-58-9f61de7`.
- Headless stream JSON path remains available through `cursor-agent --print --output-format stream-json`.
- Realmkeeper-created chat flow remains available through `cursor-agent create-chat` plus `--resume <chatId>`.
- Local help exposes `--auto-review`, `--sandbox enabled|disabled`, `--approve-mcps`, `--model`, and `--list-models`, but does not expose an external permission callback contract. Cursor should remain observe-first for permissions.

## Decisions

- Keep default launch behavior unchanged for Claude and Cursor. The current code paths are known to work and the new flags change stream shape or approval behavior.
- Add explicit tests for Claude and Cursor launch args so future feature flags are deliberate diffs.
- Treat Gemini policy-engine adoption as a safety hardening path: expose policy/admin-policy launch args in tests and use `--approval-mode yolo` only when Realmkeeper's fail-closed hook plus managed policy are installed.
- Treat Codex `tool/requestUserInput` as the next Codex-specific implementation because the app-server docs now provide the clearest native path for interjected structured prompts.

## Coverage Gaps

- This probe did not run live model turns, issue real approval requests, or mutate files.
- Cursor capability findings are based on local help because no official external approval callback contract was found in public docs.
- Claude partial-message and hook-event streams have fixture captures; `SendMessage` is classified as agent-to-agent, while live `AskUserQuestion` remains without a provider-supported trigger in print mode.
- Gemini policy files have a static dry run and launch-gate coverage; live execution still needs a supported non-interactive auth credential.
