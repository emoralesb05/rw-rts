# Plans

Tactical implementation plans. These are more volatile than architecture docs and should be deleted or rewritten once the work lands.

## Release checkpoint — 0.9.0

See the [evidence-backed release audit](./RELEASE-0.9.0-AUDIT.md) for delivered
scope, reopened gaps, test limits, and recommended next-release priorities.
Recommended order: correct workflow success claims; unify Realm/Monitor status;
add durable attention/history; add coverage-aware usage and restart/privacy gates.
This is a recommendation, not a claim that the next release is fully ticket-ready.
Post-release working tree now fails closed on unverified fix/test responses;
Realm agent activity now shares Monitor's reconciled state. Automatic
verification and durable monitoring remain next; game pressure/stats are separate.

## Active

- [`agent-observability-control-plane/`](./agent-observability-control-plane/) —
  monitoring-first follow-on: reconcile native events, provider inventory, and
  optional Herdr presence into a full-size Attention / Fleet / Inspector
  workspace with durable metadata history, usage coverage, and safe controls.
- [`session-control-plane/`](./session-control-plane/) — follow-up
  provider-native controls are now partially unblocked by focused probes:
  Codex provider-session list/fork and Claude provider-session discovery,
  attach, and logs have shipped. Claude stop/respawn, Cursor IDE control, and
  Gemini ACP remain gated.
- [`agent-orchestration-workflows/`](./agent-orchestration-workflows/) — core
  local runs shipped, but verified fix/test completion, source-trace handoff
  guards, and monitor-driven pauses remain. These are reopened contract gaps,
  not a need for a new workflow framework.

## Completed / Watchlist

- [`session-control-plane/`](./session-control-plane/) — provider-aware
  in-app send/interject, interrupt/recall gating, typed fail-closed IPC, and
  packaged-app failure coverage shipped. Follow-up: Codex list/fork and
  Claude discovery/attach/logs shipped after the 2026-07-03 probe; Claude
  live stop/respawn, Cursor attach/injection, and Gemini ACP still require
  stronger probes or provider support.
- [`agent-orchestration-workflows/`](./agent-orchestration-workflows/) —
  durable local run schemas, main-process execution, Run Board, constrained
  templates, permission/input and runtime-budget pauses, and packaged-app
  orchestration e2e shipped.
  Remaining contract gaps are listed above. Watchlist: cross-provider result judging, richer cost budgets, or external
  workflow-engine adoption if local complexity justifies it.

## Removed From Active

Completed provider plans were removed once their decisions shipped.
Durable provider behavior now lives in [`../providers/`](../providers/), and
dated probe evidence lives in [`../providers/probes/`](../providers/probes/).
The provider-neutral permission-rule plan shipped as Realmkeeper-local saved
rules; provider-native config mirroring remains deferred until it can be made an
explicit per-provider opt-in.
Codex app-server request parity shipped as visible decline/cancel handling for
URL and arbitrary form elicitations, schema-compatible form acceptance, and a
dynamic-tool allowlist boundary; durable behavior lives in
[`../providers/codex.md`](../providers/codex.md).
