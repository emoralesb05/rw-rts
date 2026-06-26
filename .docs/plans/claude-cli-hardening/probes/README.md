# Claude CLI hardening probes

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| [claude-rich-stream-probe-2026-06-26.md](claude-rich-stream-probe-2026-06-26.md) | Do `--include-hook-events`, `--include-partial-messages`, and `--prompt-suggestions` produce stream shapes Realmkeeper can safely normalize? | Rich stream emits `system`, `stream_event`, `rate_limit_event`, final `assistant`, and `result`; current parser accepts and normalizer ignores extras. | Claude auth/network |
