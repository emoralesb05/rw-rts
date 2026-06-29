# Cursor agent hardening probes

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| [provider-cli-capability-2026-06-26.md](../../provider-cli-hardening/probes/provider-cli-capability-2026-06-26.md) | What does the installed Cursor Agent expose in help/version output? | Local CLI exposes create/resume/list/model lifecycle, stream JSON, `--force`/`--yolo`, `--auto-review`, sandbox, MCP, plugin, and worker flags; no external permission callback contract was found. | No |
| [cursor-active-resume-stream-fixture-2026-06-29.md](cursor-active-resume-stream-fixture-2026-06-29.md) | Do active and resumed print-mode turns emit enough stream JSON to cover assistant, shell/edit, and completion events? | Blocked: `create-chat` returned a chat id, but print-mode resume exited with `Authentication required`; `cursor-agent status` alone is not enough. | Yes: `cursor-agent login` for headless turns or `CURSOR_API_KEY`, plus safe scratch repo |
