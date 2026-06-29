# Probe: Cursor active/resume stream fixture

## Question

Do active and resumed `cursor-agent --print --output-format stream-json` turns emit enough stream JSON to cover assistant, shell/edit, and completion events?

## Setup

- Installed CLI: `2026.06.24-00-45-58-9f61de7`.
- Scratch repo: `/private/tmp/rw-rts-cursor-live-auth-20260629`.
- Initial non-mutating status check: `cursor-agent status` returned a logged-in status but could not fetch user details, while `cursor-agent about` showed `User Email: Not logged in`.
- After running `cursor-agent login` and completing browser auth, `cursor-agent about` showed `Subscription Tier: Pro+` and `cursor-agent models` succeeded.

## Commands

```bash
cursor-agent create-chat --workspace /private/tmp/rw-rts-cursor-live-auth-20260629
cursor-agent --print --output-format stream-json --force --trust \
  --resume <chatId> \
  --workspace /private/tmp/rw-rts-cursor-live-auth-20260629 \
  "Realmkeeper live stream fixture active turn..."
cursor-agent --print --output-format stream-json --force --trust \
  --resume <chatId> \
  --workspace /private/tmp/rw-rts-cursor-live-auth-20260629 \
  "Realmkeeper live stream fixture resumed turn..."
```

## Finding

The first attempt proved an auth edge case: `create-chat` returned a chat id, but the first print-mode turn exited before streaming:

```text
Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.
```

This means `cursor-agent status` is not sufficient proof that headless print-mode turns can run. After completing `cursor-agent login`, the same print-mode path worked.

Both active and resumed turns emitted:

- `system` / `init` with `apiKeySource: "login"`, `cwd`, `session_id`, model, and permission mode.
- `user` echo.
- `tool_call` / `started` with `shellToolCall.args`.
- `tool_call` / `completed` with `shellToolCall.result.success`.
- Final `assistant` text.
- `result` / `success` with usage.

The active turn wrote `cursor-live-fixture-active`; the resumed turn appended `cursor-live-fixture-resume`.

## Outcome

- Stream shape matches Realmkeeper's adapter assumptions: ignore `system/init` and `tool_call/started`, normalize `tool_call/completed`, final `assistant`, and `result`.
- Resume preserved the same chat id.
- Scratch file verification:

```text
cursor-live-fixture-active
cursor-live-fixture-resume
```

- No files in the Realmkeeper repo were modified by Cursor.
- Headless auth must be validated with an API-backed command such as `cursor-agent models`, not just `cursor-agent status`.
