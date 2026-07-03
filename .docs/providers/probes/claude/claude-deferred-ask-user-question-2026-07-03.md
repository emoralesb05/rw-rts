# Probe: Claude deferred AskUserQuestion result

## Question

Can Realmkeeper validate the Claude deferred `AskUserQuestion` answer-letter
path with the local CLI?

## Setup

- Installed CLI: `2.1.198 (Claude Code)`.
- Local auth probe: `claude config list`.
- Help probe: `claude -p --help`.
- Public docs checked:
  - `https://code.claude.com/docs/en/hooks`
  - `https://code.claude.com/docs/en/cli-reference`

## Finding

- The local CLI is not logged in: `Not logged in - Please run /login`.
- `claude -p --help` still exposes `--brief`, `--tools`,
  `--output-format stream-json`, `--input-format stream-json`,
  `--replay-user-messages`, `--include-hook-events`,
  `--include-partial-messages`, and `--max-budget-usd`.
- The public CLI reference documents `--tools` as the built-in tool availability
  restriction flag.
- The currently rendered hooks page lists a "Defer a tool call for later"
  section in the table of contents, but the fetched page body did not expose the
  `AskUserQuestion`, `tool_deferred`, or `deferred_tool_use` details during this
  probe.

## Outcome

Realmkeeper now has synthetic stream-normalizer coverage for the provider-shaped
`result.stop_reason: "tool_deferred"` / `deferred_tool_use.name:
"AskUserQuestion"` record. That path emits the same `user_input_request` answer
letter used by hook-driven `AskUserQuestion`.

A live deferred-resume capture remains blocked until a logged-in Claude CLI can
produce the provider event.
