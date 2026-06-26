# Providers

The external CLI agents Realmkeeper integrates with: Claude, Cursor, Codex, Gemini. Fast-changing reference — these docs capture upstream behavior we don't control.

For our internal architecture, see [`../architecture/`](../architecture/).
For vocabulary (RW terms + technical), see [`../glossary.md`](../glossary.md).

## Files

- [`hooks.md`](./hooks.md) — cross-tool hook protocol, event-name conventions, multiplexer, coverage matrix
- [`claude.md`](./claude.md) — Claude Code CLI: hooks, JSONL transcript, resume semantics, gaps
- [`codex.md`](./codex.md) — Codex CLI + Desktop: app-server drive path, two rollout formats, version drift
- [`cursor.md`](./cursor.md) — Cursor CLI + IDE: hook stripping on `--print --resume`, identifier confusion (sessionId vs chatId)
- [`gemini.md`](./gemini.md) — Gemini CLI: hooks, stream-json spawn, UUID resume, BeforeTool deny gate, subagent transcript linking
- [`extending.md`](./extending.md) — checklist for adding a new provider

## Reading order

Start with [`hooks.md`](./hooks.md) for the cross-tool overview. Then dive into a specific provider only when you're debugging or extending that integration.

If you're adding a new CLI, jump straight to [`extending.md`](./extending.md).

## Last verified

Local CLI versions checked 2026-06-25:

| Provider | Local CLI |
|---|---|
| Claude Code | `claude` 2.1.191 |
| Codex | `codex-cli` 0.142.2 |
| Cursor Agent | `cursor-agent` 2026.06.24-00-45-58-9f61de7 |
| Gemini CLI | `gemini` 0.47.0 |

Sources checked:

- Claude Code CLI reference: `https://code.claude.com/docs/en/cli-reference`
- Codex CLI reference: `https://developers.openai.com/codex/cli/reference`
- Codex app-server reference: `https://developers.openai.com/codex/app-server`
- Gemini CLI commands: `https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/commands.md`
- Gemini CLI configuration: `https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/configuration.md`
- Gemini hook authoring: `https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/writing-hooks.md`
- Cursor: local `cursor-agent --help` and `cursor-agent --version` because the public docs route currently renders through the Cursor docs app and did not expose a stable text reference during this pass.

## When to update

Update a provider file as soon as you discover something that no longer matches reality. Stale provider docs are worse than missing ones — they actively mislead. Each file's "Gaps & quirks" section is the most valuable part to keep current; that's where surprising upstream behaviors live.
