# Probe: Claude rich stream flags

**Date:** 2026-06-26
**Scope:** Live `claude -p --output-format stream-json --verbose` turn with richer stream flags enabled.

## Commands

```bash
claude --version
claude --help
node .docs/providers/probes/claude/claude-rich-stream-probe-2026-06-26.mjs
```

## Result

- Installed CLI was `2.1.193 (Claude Code)`.
- Probe args included `--include-hook-events`, `--include-partial-messages`, `--prompt-suggestions`, `--tools ""`, and `--no-session-persistence`.
- The turn completed successfully with final assistant/result text `realmkeeper-claude-rich-stream-probe`.
- Event counts from the live run:
  - `system`: 34
  - `stream_event`: 7
  - `assistant`: 1
  - `rate_limit_event`: 1
  - `result`: 1
- `system` records included hook lifecycle subtypes such as `hook_started` and hook names like `SessionStart:startup`.
- `stream_event` records included nested event types such as `message_start`, `content_block_start`, and `content_block_delta`.
- No `prompt_suggestion` record was emitted for this minimal no-tool turn.
- No parse errors or stderr lines were observed.

## Conclusion

Realmkeeper's current loose stream parser can accept the richer Claude event stream, and `normalizeStreamMessage()` safely ignores the extra event types today. Keep the richer flags off by default until partial-message rendering has an explicit transient UI path and prompt-suggestion behavior is captured on a turn that actually emits suggestions.
