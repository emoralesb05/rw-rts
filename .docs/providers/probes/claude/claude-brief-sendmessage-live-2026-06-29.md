# Probe: Claude brief SendMessage live turn

## Question

Can Claude `--brief` provide a provider-native human question path that Realmkeeper can map to answer letters?

## Setup

- Installed CLI: `2.1.195 (Claude Code)`.
- Scratch repo: `/private/tmp/rw-rts-claude-brief-20260629`.
- Realmkeeper dev app was running for the first pass so the hook bridge was available.
- Follow-up stream classification suppressed user settings/plugins with `--setting-sources project,local` to avoid unrelated hook/plugin output.

Commands:

```bash
claude -p --output-format stream-json --verbose \
  --brief \
  --tools SendMessage \
  --setting-sources project,local \
  --model sonnet \
  --max-budget-usd 0.02 \
  --session-id 44444444-5555-4666-8777-888888888888 \
  "Send one brief message..."
```

## Finding

- H1 measured: `--brief --tools SendMessage` initializes with `tools: ["SendMessage"]`. The help text calls the feature `SendUserMessage`, but the live stream exposes `SendMessage`.
- H2 measured: Claude emits a normal `assistant` `tool_use` block with `name: "SendMessage"` and an input containing `to`, `summary`, `message`, `type`, `recipient`, and `content`.
- H3 measured: Sending to `main` returns a normal `user` `tool_result` with `success: false` and a message that `main` is the main conversation and the tool should send to a named agent instead.
- D1 decided: treat `SendMessage` as Claude agent-to-agent visibility, not as human-question parity. It should not be routed into Realmkeeper answer letters unless Claude exposes a contract for human replies.

## Outcome

Realmkeeper's generic Claude stream normalizer already preserves this exchange as `tool_use` / `tool_result`; `src/main/adapters/cli-streams.test.ts` now locks that behavior with a minimal fixture.

The live `AskUserQuestion` / `updatedInput` letter path remains synthetic-only. The current live CLI surface did not provide a provider-native way to ask the human user and receive a typed answer inside a print-mode turn.

## Coverage gaps

- This probe does not validate named-agent routing because Realmkeeper has no UI concept for Claude agent-to-agent messages yet.
- This probe does not validate hook payloads for `SendMessage`; the clean classification run disabled user settings/plugins. The stream payload is enough for current Realmkeeper behavior because active Claude turns already normalize stdout stream records.
- `--max-budget-usd` again behaved as a stop guard rather than an exact ceiling.
