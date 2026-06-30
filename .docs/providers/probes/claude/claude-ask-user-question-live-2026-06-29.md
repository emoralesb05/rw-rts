# Probe: Claude AskUserQuestion live turn

## Question

Can Realmkeeper validate the live Claude `PreToolUse` / `AskUserQuestion` answer-letter path with a bounded print-mode turn?

## Setup

- Installed CLI: `2.1.195 (Claude Code)`.
- Scratch repo: `/private/tmp/rw-rts-claude-live-20260629`.
- Realmkeeper dev app was running so the hook bridge could receive live hook events.
- Command used a fixed session id and a small budget cap:

```bash
claude -p --output-format stream-json --verbose \
  --max-budget-usd 0.05 \
  --tools AskUserQuestion \
  --session-id 11111111-2222-4333-8444-555555555555 \
  "Realmkeeper live AskUserQuestion fixture..."
```

## Finding

The stream initialized with `tools: []`, so this invocation did not expose `AskUserQuestion` as an executable tool. Claude then emitted XML-like text that looked like an intended tool call, but the runtime treated it as malformed text and retried. No live `PreToolUse` / `AskUserQuestion` hook event reached Realmkeeper.

The run ended with `error_max_budget_usd` after two turns. The result reported `total_cost_usd: 0.0691675`, so the max-budget guard can be exceeded slightly before the CLI stops.

## Outcome

- The synthetic Realmkeeper `AskUserQuestion` answer-letter implementation remains covered by unit tests and the Demos fixture.
- No live deferred `AskUserQuestion` fixture was captured.
- Do not retry this exact `--tools AskUserQuestion` shape. A follow-up `--brief` probe exposed `SendMessage`, but that tool targets named agents, not the human user. Live `AskUserQuestion` capture still needs a documented/provider-supported way to make Claude expose or choose that tool in print mode.
