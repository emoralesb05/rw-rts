# Probe: Cursor active/resume stream fixture

## Question

Do active and resumed `cursor-agent --print --output-format stream-json` turns emit enough stream JSON to cover assistant, shell/edit, and completion events?

## Setup

- Installed CLI: `2026.06.24-00-45-58-9f61de7`.
- Scratch repo: `/private/tmp/rw-rts-cursor-live-20260629`.
- Non-mutating status check: `cursor-agent status` returned a logged-in status but could not fetch user details.

## Commands

```bash
cursor-agent create-chat --workspace /private/tmp/rw-rts-cursor-live-20260629
cursor-agent --print --output-format stream-json --force --trust \
  --resume <chatId> \
  --workspace /private/tmp/rw-rts-cursor-live-20260629 \
  "Realmkeeper live stream fixture..."
```

## Finding

`create-chat` returned a chat id, but the first print-mode turn exited before streaming:

```text
Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.
```

This means `cursor-agent status` is not sufficient proof that headless print-mode turns can run. The active/resume stream fixture remains open until the machine has a working Cursor Agent login for headless turns or a `CURSOR_API_KEY`.

## Outcome

- No stream fixture was captured.
- No files in the Realmkeeper repo were modified by Cursor.
- Next probe should start from the same scratch-repo shape after `cursor-agent login` succeeds for headless turns or `CURSOR_API_KEY` is set.
