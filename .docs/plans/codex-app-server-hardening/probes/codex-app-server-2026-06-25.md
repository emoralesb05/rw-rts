# Probe: Codex App Server Protocol

Date: 2026-06-25

## Commands

```bash
codex app-server --help
codex app-server generate-ts --out /private/tmp/rw-codex-app-server-schema/ts
codex app-server generate-json-schema --out /private/tmp/rw-codex-app-server-schema/json
```

## Findings

- Installed CLI: `codex-cli 0.142.2`.
- `codex app-server` supports `stdio://`, `unix://`, `ws://IP:PORT`, and `off`.
- The current local protocol exposes `thread/start`, `thread/resume`, `turn/start`, `turn/steer`, and `turn/interrupt`.
- Text `UserInput` requires `{ "type": "text", "text": "...", "text_elements": [] }`.
- `turn/steer` requires `expectedTurnId`; Realmkeeper must track the active turn from `turn/start` responses or `turn/started` notifications.
- `thread/start` and `thread/resume` accept `approvalPolicy` and `sandbox` overrides.
- App-server can send server requests for command/file/permission approvals, MCP elicitations, dynamic tool calls, and user-input prompts. Realmkeeper routes binary command/file/permission approvals through permission cards; richer user-input, MCP elicitation, and dynamic tool requests remain fail-closed.

## Implementation Decision

Use app-server as the default Codex drive surface. Keep the old `codex exec --json` normalizer only for legacy stream fixture coverage and transcript-format compatibility.
