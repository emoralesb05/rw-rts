# Decisions — agent monitoring control plane

> Chronological record for [`README.md`](./README.md). The July entries shipped
> the first trace layer; September reframes the next slice around monitoring.

## 2026-07-03 — derive local traces before vendor integration
**Decided:** Keep the event bus as the source spine, project local traces, redact
content by default, and make export optional.
**Evidence:** [D1](./RESEARCH.md#d1), [D2](./RESEARCH.md#d2).
**Replaces:** —.
**Consequence:** Trace projection, JSONL storage, Observatory, monitor letters,
usage attributes, and OTel-shaped export shipped.

## 2026-09-21 — make monitoring the primary operational workspace
**Decided:** Monitor opens the daily Attention → Fleet → Inspector workflow;
Star Chart remains the optional Realm view.
**Evidence:** [H6](./RESEARCH.md#h6), [H11](./RESEARCH.md#h11).
**Replaces:** Treating a narrow Observatory tab and peripheral HUD as the whole
monitoring information architecture.
**Consequence:** `.docs/vision.md` changes before implementation, and UI work is
a full-size renderer mode rather than another Kingdom-panel tab.

## 2026-09-21 — reconcile sources in main with explainable authority
**Decided:** A `MonitorService` merges event, provider inventory, optional Herdr,
and usage observations with explicit precedence, TTL, confidence, and conflict
evidence.
**Evidence:** [H8](./RESEARCH.md#h8), [H12](./RESEARCH.md#h12).
**Replaces:** Renderer-only derivation from the latest event window.
**Consequence:** Renderer becomes a snapshot/delta consumer and cannot invent
idle/success from absent events.

## 2026-09-21 — integrate Herdr narrowly
**Decided:** Use compatible Herdr metadata for presence, native session aliases,
and focus/attach. Keep the adapter optional and exclude terminal reading,
prompting, keystrokes, layout, worktrees, and remote transport from v1.
**Evidence:** [H8](./RESEARCH.md#h8), [H10](./RESEARCH.md#h10), [H15](./RESEARCH.md#h15).
**Replaces:** Rebuilding a terminal/session substrate inside Realmkeeper.
**Consequence:** Realmkeeper works standalone and degrades one source when Herdr
is unavailable.

## 2026-09-21 — persist one metadata observation once
**Decided:** Add a compact monitor journal, current snapshot, and daily usage
rollups; do not extend whole-trace snapshots into the monitoring index.
**Evidence:** [H9](./RESEARCH.md#h9), [H13](./RESEARCH.md#h13).
**Replaces:** Treating `traces/YYYY-MM-DD.jsonl` as future fleet history.
**Consequence:** Existing trace export stays compatible. SQLite is conditional
on failing the build-time scale gate, not chosen speculatively.

## 2026-09-21 — preserve uncertainty in usage and controls
**Decided:** Usage carries reported/derived/unavailable coverage, and every
provider action reuses existing capability/permission control paths.
**Evidence:** [H7](./RESEARCH.md#h7), [H14](./RESEARCH.md#h14), [H15](./RESEARCH.md#h15).
**Replaces:** Aggregated totals that can look complete and UI actions inferred
from provider identity alone.
**Consequence:** Unknown is visible; unsupported actions are disabled with a
reason; no estimated dollar totals ship in this slice.

