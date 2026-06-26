# Plan: Codex app-server hardening

**Status**: in progress 2026-06-26 · **Owner**: Realmkeeper · **Phase**: provider reliability

## Goal

Use Codex app-server as Realmkeeper's rich Codex integration surface, including active session start, resume, mid-turn steering, event streaming, and permission approvals.

## Implemented Baseline

- `codex app-server --stdio` starts new Codex sessions from Realmkeeper.
- `thread/resume` plus `turn/start` drives observed sessions from Realmkeeper.
- Active Realmkeeper-spawned sessions use `turn/steer` when there is an in-flight turn.
- App-server notifications normalize into Realmkeeper events.

## Current Hardening Work

- Route `item/commandExecution/requestApproval` to permission cards.
- Route `item/fileChange/requestApproval` to permission cards.
- Route `item/permissions/requestApproval` to permission cards and grant the requested profile for the current turn when allowed.
- Keep legacy `applyPatchApproval` and `execCommandApproval` compatible with one-time allow/deny responses.
- Route `item/tool/requestUserInput` to structured answer letters and reply with `{ answers: { [questionId]: { answers: string[] } } }`.
- Route typed `mcpServer/elicitation/request` form mode to answer letters and reply with `{ action: "accept", content }` or `{ action: "decline", content: null }`.

## Remaining Follow-ups

- Decide whether `mcpServer/elicitation/request` URL mode and `openai/form` mode need first-class UI; they currently fail closed.
- Decide whether dynamic app-server tools belong in Realmkeeper or should stay disabled until a concrete local tool use case exists.
- Add a live app-server probe that starts a throwaway session and verifies at least one permission request round trip without touching real files.

## Probe Location

- Protocol probe: [probes/codex-app-server-2026-06-25.md](probes/codex-app-server-2026-06-25.md)
- CLI/docs snapshot: [probes/provider-cli-capability-2026-06-26.md](probes/provider-cli-capability-2026-06-26.md)
