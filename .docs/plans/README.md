# Plans

Tactical implementation plans. These are more volatile than architecture docs and should be deleted or rewritten once the work lands.

## Active

No active implementation plans. Current follow-up work is deferred behind
provider contracts or future product decisions, and is captured in the
completed plan artifacts below.

## Completed / Watchlist

- [`agent-observability-control-plane/`](./agent-observability-control-plane/) —
  local-first traces, session health, monitor letters, conditional usage
  totals, and OTel Collector validation shipped. Watchlist: strict GenAI
  semantic-convention revalidation and Codex/Gemini usage if providers expose
  reliable values.
- [`session-control-plane/`](./session-control-plane/) — provider-aware
  in-app send/interject, interrupt/recall gating, typed fail-closed IPC, and
  packaged-app failure coverage shipped. Watchlist: provider-native fork,
  attach, list, and live-interrupt controls only after focused probes prove
  stable contracts.
- [`agent-orchestration-workflows/`](./agent-orchestration-workflows/) —
  durable local run schemas, main-process execution, Run Board, constrained
  templates, monitor pauses, and packaged-app orchestration e2e shipped.
  Watchlist: cross-provider result judging, richer cost budgets, or external
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
