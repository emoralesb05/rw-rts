# Probe: Claude deferred AskUserQuestion result

## Question

Can Realmkeeper validate the Claude deferred `AskUserQuestion` answer-letter
path with the local CLI?

## Setup

- Installed CLI: `2.1.199 (Claude Code)`.
- Local auth probe: `claude auth status`.
- Help probe: `claude -p --help`.
- Clean print-mode `AskUserQuestion` probe in
  `/private/tmp/rw-rts-claude-askuser-20260703`.
- Generic defer-envelope probe in
  `/private/tmp/rw-rts-claude-defer-20260703`, with a temporary project-local
  `PreToolUse` hook for `Bash` returning:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "defer"
  }
}
```

- Public docs checked:
  - `https://code.claude.com/docs/en/hooks`
  - `https://code.claude.com/docs/en/cli-reference`

## Finding

- The user-visible CLI is logged in: `loggedIn: true`, `authMethod:
  "claude.ai"`, `apiProvider: "firstParty"`, `subscriptionType: "max"`.
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
- Clean print mode did not expose `AskUserQuestion`: the init event's `tools`
  list omitted it, and Claude called `ToolSearch` with `select:AskUserQuestion`;
  the tool returned `No matching deferred tools found`.
- Generic defer is live-confirmed. The temporary Bash hook produced:

```json
{
  "type": "result",
  "subtype": "success",
  "stop_reason": "tool_deferred",
  "deferred_tool_use": {
    "id": "toolu_01AYmzQsLpv4eaMXPvmWem35",
    "name": "Bash",
    "input": { "command": "echo realmkeeper-defer-probe" }
  },
  "terminal_reason": "tool_deferred"
}
```

## Outcome

Realmkeeper now has synthetic stream-normalizer coverage for the provider-shaped
`result.stop_reason: "tool_deferred"` / `deferred_tool_use.name:
"AskUserQuestion"` record. That path emits the same `user_input_request` answer
letter used by hook-driven `AskUserQuestion`.

The live provider envelope is confirmed for a deferred Bash tool. A live
`AskUserQuestion` deferred-resume capture remains open because clean print mode
did not expose `AskUserQuestion` as an available or deferred tool.
