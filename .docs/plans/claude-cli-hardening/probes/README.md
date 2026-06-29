# Claude CLI hardening probes

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| [claude-rich-stream-probe-2026-06-26.md](claude-rich-stream-probe-2026-06-26.md) | Do `--include-hook-events`, `--include-partial-messages`, and `--prompt-suggestions` produce stream shapes Realmkeeper can safely normalize? | Rich stream emits `system`, `stream_event`, `rate_limit_event`, final `assistant`, and `result`; current parser accepts and normalizer ignores extras. | Claude auth/network |
| [claude-ask-user-question-live-2026-06-29.md](claude-ask-user-question-live-2026-06-29.md) | Can a bounded live turn validate `PreToolUse` / `AskUserQuestion` answer letters? | No: `--tools AskUserQuestion` initialized with `tools: []`; Claude emitted malformed text instead of a real tool call and then hit the budget cap. | Provider-supported way to expose/trigger `AskUserQuestion` in print mode |
| [claude-brief-sendmessage-live-2026-06-29.md](claude-brief-sendmessage-live-2026-06-29.md) | Can `--brief` provide a provider-native human question path for Realmkeeper letters? | No: `--brief --tools SendMessage` emits normal `tool_use` / `tool_result` records, but the tool expects a named agent target, not the main human user. | No for classification; yes for any future named-agent routing UI |
