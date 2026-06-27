# Cursor agent hardening probes

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| [provider-cli-capability-2026-06-26.md](../../provider-cli-hardening/probes/provider-cli-capability-2026-06-26.md) | What does the installed Cursor Agent expose in help/version output? | Local CLI exposes create/resume/list/model lifecycle, stream JSON, `--force`/`--yolo`, `--auto-review`, sandbox, MCP, plugin, and worker flags; no external permission callback contract was found. | No |
| `cursor-active-resume-stream-fixture` | Do active and resumed print-mode turns emit enough stream JSON to cover assistant, shell/edit, and completion events? | Open. Needed before changing Cursor defaults. | Yes: authenticated Cursor CLI and safe scratch repo |
