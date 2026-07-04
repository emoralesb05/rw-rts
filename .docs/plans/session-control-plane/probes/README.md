# Session Control Plane Probes

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| [P1 - Provider-native controls](./provider-native-controls-2026-07-03.md) | Which provider-native fork, attach, list, and interrupt controls are stable enough to ticket next? | Codex app-server list/fork is ticketable; Claude background list/attach/logs is ticketable with kind gating; Cursor remains observe/resume only; Gemini ACP is real but auth-gated here. | Local CLIs; optional live provider auth for Gemini ACP |
