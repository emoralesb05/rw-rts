# Providers

The external CLI agents keykeeper integrates with: Claude, Cursor, Codex, Gemini. Fast-changing reference — these docs capture upstream behavior we don't control.

For our internal architecture, see [`../architecture/`](../architecture/).
For vocabulary (KH terms + technical), see [`../glossary.md`](../glossary.md).

## Files

- [`hooks.md`](./hooks.md) — cross-tool hook protocol, event-name conventions, multiplexer, coverage matrix
- [`claude.md`](./claude.md) — Claude Code CLI: hooks, JSONL transcript, resume semantics, gaps
- [`codex.md`](./codex.md) — Codex CLI + Desktop: two rollout formats, version drift, "thread not found" log noise
- [`cursor.md`](./cursor.md) — Cursor CLI + IDE: hook stripping on `--print --resume`, identifier confusion (sessionId vs chatId)
- [`gemini.md`](./gemini.md) — Gemini CLI: hooks, stream-json spawn, UUID resume, observation-only permissions
- [`extending.md`](./extending.md) — checklist for adding a new provider

## Reading order

Start with [`hooks.md`](./hooks.md) for the cross-tool overview. Then dive into a specific provider only when you're debugging or extending that integration.

If you're adding a new CLI, jump straight to [`extending.md`](./extending.md).

## When to update

Update a provider file as soon as you discover something that no longer matches reality. Stale provider docs are worse than missing ones — they actively mislead. Each file's "Gaps & quirks" section is the most valuable part to keep current; that's where surprising upstream behaviors live.
