# Agent monitoring control plane — see every agent, notice what needs attention, and intervene safely

> **Status:** 🚧 Partially shipped in 0.9.0 — Monitor, Herdr, and packaged smoke coverage are delivered; durable attention/history/usage and cross-view consistency remain.
> **Owner:** TBD
> **Drafted:** 2026-07-03 · **Last updated:** 2026-09-22 (reconciled release scope; reran probes 01/03; live evidence not refreshed)
> **Scope:** Unified local fleet state, attention, usage, history, integration health, and safe intervention; not a terminal multiplexer or autonomous project manager.
> **Effort:** 5 PRs, large
> **Start here:** README.md, ARCHITECTURE.md, RESEARCH.md, probes/README.md
> **Detail:** [ARCHITECTURE](./ARCHITECTURE.md) · [RESEARCH](./RESEARCH.md) · [DECISIONS](./DECISIONS.md) · [probes](./probes/README.md)
> **Related:** [session control](../session-control-plane/) · [orchestration workflows](../agent-orchestration-workflows/)

## What this is and why now

Realmkeeper now has a primary Monitor workspace backed by main-process
reconciliation. Its live fleet is not the legacy Observatory's 500-event
projection, but monitoring state still disappears on restart. Native inventory
is implemented for Claude and Codex; other providers can arrive through events
or optional presence sources without gaining unsupported controls.

The next slice makes that monitor durable and keeps Realm status consistent
with its evidence. Existing provider CLIs remain the execution authority.

Herdr is an optional high-quality presence source for agents running in its
panes. Realmkeeper does not require it and does not reproduce its terminal,
worktree, or remote-session substrate.

## Implementation checkpoint — 0.9.0

Shipped in release 0.9.0:

- typed observation, agent, attention, integration-health, snapshot, and delta
  contracts;
- a main-process `MonitorService` with identity reconciliation, authority,
  fixed freshness transitions, provider inventory polling, metadata-only
  privacy, and capability projection;
- validated snapshot/delta IPC across main, preload, and renderer;
- the default full-size Monitor workspace with Attention, Fleet, Inspector,
  filtering, source evidence, capability-gated controls, and a remembered
  Monitor / Realm switch;
- an optional, metadata-only Herdr 0.9.1 source with native-session merging,
  heartbeat freshness, integration health, and pane focus;
- Monitor fixture E2E for fleet, blocking attention, evidence, filtering, and
  switching back to Realm, exercised in both source and packaged release runs.

Earlier live-session checks are dated evidence, not refreshed compatibility
claims. Remaining: durable attention/history, usage rollups, and expanded
restart/intervention/privacy/performance coverage.
See the [release audit](../RELEASE-0.9.0-AUDIT.md) for evidence and sequencing.

Post-release working tree: shared Monitor/Realm agent activity is implemented,
including main-owned freshness, blocking state, and snapshot recovery. Game
pressure and historical stats remain separate. A bounded last-seen checkpoint
now retains up to 200 session metadata rows for 30 days, exposes restart gaps,
and keeps history separate from live agents and permission controls. This is
not the full journal: resolved-attention history, backfill, configurable
retention, and usage rollups remain pending. No new release is implied.

Next working-tree slice: main-owned acknowledgement, fixed 15-minute snooze,
and reopen actions are implemented via validated occurrence-bound IPC. Preferences
are persisted separately from live state. New requests reopen; stale actions and
late mismatched resolutions cannot affect a newer blocker. Exact event-backed
occurrences can recover their choices after fresh evidence; unidentified continuity
reopens after restart. No permission is answered by these notification actions.
The full resolved-attention audit trail and configurable snooze durations remain
out of scope. See [state ownership](../../architecture/state.md).

Verification for the attention slice: 413 unit/component tests, 25 source-build
Electron regressions, and 3 targeted packaged-app checks (shell, notification
controls/Realm blocking, actual restart) passed. Typecheck, lint, and build passed.
The packaged check used a temporary unsigned macOS arm64 app, not a new release.

The last-seen slice has source-build Electron restart coverage: a saved blocker
is visible only in history after relaunch, live permission attention stays empty,
and a fresh fixture session appears separately. Unit coverage exercises metadata
allowlisting, identity deduplication, retention/caps, quarantine, write failure,
checkpoint timers, shutdown cleanup, and same-session recovery with fresh evidence.
This does not establish provider replay, crash-tail recovery, the 100,000-event
scale target, or a complete packaged regression run of all post-release changes.

## What we decided

Interaction working-tree checkpoint: Monitor now opens a conversation drawer
alongside the fleet with captured messages/tool activity, inline existing request
cards, and explicit send/steer/resume semantics. Provider/native identity isolates
conversations; local routing IDs survive native inventory reconciliation. Model
and approval status are informational only. Editable model/policy settings,
provider transcript backfill, and shared Monitor/Realm composer consolidation
remain pending. Existing Realm chat is unchanged.

Drawer verification: 421 unit/component tests and 26 source-build Electron
regressions passed. After the compact fleet layout and missing-metadata guards,
the final build passed 4 packaged-app checks (shell, conversation/message/inline
permission flow, attention/Realm parity, and restart). Typecheck, lint, and build
passed. These are isolated fixture checks, not new live-provider compatibility
claims or a release. That checkpoint retained terminal-session control restrictions.

The next interaction slice adds explicit terminal-session resume with main-owned
identity/state validation, per-provider/native-session in-memory drafts and pending
actions, and acceptance versus subsequent activity labels. It does not restore
controls from last-seen history or claim correlated delivery receipts. Model and
approval-policy editing remain pending. Provider resume uses existing adapters;
this is not a new live-CLI compatibility claim.

Resume/draft verification: 433 unit/component tests, typecheck, lint, and build
passed. All 26 packaged Electron regressions passed; after tightening resume to
require done (not merely failed), the final packaged build passed 5 targeted shell,
Monitor interaction/attention/restart, and session-control checks. These use
isolated fixtures, not live provider turns. No release or commit was made for this
slice.

| # | Decision | Settled by |
|---|---|---|
| 1 | ✅ Make Monitor the primary operational workspace; retain Star Chart as Realm view. | [H11](./RESEARCH.md#h11) |
| 2 | ✅ Reconcile observations in Electron main with explicit source authority and freshness. | [H12](./RESEARCH.md#h12) |
| 3 | ✅ Support Herdr as optional read-only presence/focus integration, never a runtime requirement. | [H8](./RESEARCH.md#h8), [H10](./RESEARCH.md#h10) |
| 4 | ✅ Reuse typed session-control and permission paths for interventions. | [H7](./RESEARCH.md#h7), [H15](./RESEARCH.md#h15) |
| 5 | ✅ Persist compact metadata observations and rollups once; do not use whole-trace snapshots as the monitoring history. | [H9](./RESEARCH.md#h9), [H13](./RESEARCH.md#h13) |
| 6 | ✅ Show reported, derived, and unavailable usage separately; never present unknown as zero. | [H14](./RESEARCH.md#h14) |

## What ships, in order

Original sequence: PRs 1–3 shipped; PR 4 remains; PR 5 is partial (integration
health and packaged smoke shipped, full acceptance matrix remains).

| PR | Size | What it delivers | Why now |
|---|---|---|---|
| 1 | L | Product-vision update, monitoring schemas, main-process `MonitorService`, source authority, and snapshot IPC | Establishes one truthful model before another UI reads competing state |
| 2 | L | Event-bus/provider-inventory sources, optional Herdr source, identity reconciliation, and integration health | Gives the fleet view broad, explainable coverage |
| 3 | L | Full-size Monitor workspace with Attention, Fleet, Inspector, and capability-backed actions | Delivers the daily workflow the product currently lacks |
| 4 | L | Durable attention lifecycle, compact metadata history, restart hydration, and usage rollups | Makes the monitor useful beyond the current renderer session |
| 5 | M | Provider/version diagnostics, degraded-source behavior, privacy/performance gates, and packaged-app E2E | Makes the cockpit trustworthy enough for daily use |

## How we'll know it worked

- A deterministic 100-agent fixture reconciles a snapshot in under 50 ms; a
  100,000-observation/30-day fixture hydrates in under 500 ms and occupies less
  than 50 MB on the project reference machine.
- A permission or user-input request appears in Attention within one second;
  Herdr/provider lifecycle changes appear within five seconds.
- Every fleet row displays provider, repo/worktree when known, state, state
  reason, source, freshness, and only the controls currently supported.
- Fixture E2E proves approve/deny, send, interrupt, stop, attach/logs, and
  Herdr focus either succeed or fail closed with an actionable reason.
- Restart E2E preserves acknowledgement/snooze state and 30-day usage rollups,
  while stale agents become `unknown` or `offline` instead of falsely `idle`.
- A sentinel secret in prompt/tool content is absent from all monitor files and
  exports under the default metadata-only policy.
- Monitor renders without clipping at 1280×720 and 1440×900. `bun run
  typecheck`, plain `bun run test`, build, and relevant Electron E2E pass.

## What we don't know yet

- The original five-second provider-lifecycle target is not met by the
  15-second inventory polling interval. Resolve this with a bounded polling
  design and latency test; do not silently weaken the target.
- Shared agent activity is implemented in the post-release working tree.
  World pressure, stats, and historical poses remain game mechanics rather than
  operational evidence; do not interpret them as verified task outcomes.
- Cursor, Gemini, Antigravity, and a genuinely blocked Herdr agent were not
  present in the live seven-agent sample; those adapters need fixtures plus
  post-build live validation.
- Reliable token and cost fields vary by provider. The UI can prove coverage,
  not manufacture missing usage.
- The scale and latency targets are build-gated. If compact JSON metadata misses
  them, a follow-on can justify SQLite with measured data instead of assumption.
- Herdr is versioned independently. Its adapter must negotiate protocol/schema
  support and disable itself cleanly on incompatibility.
- Full-text prompt/output search, remote/mobile control, eval scoring, and
  autonomous workflow ranking are explicitly outside this slice.

## Where the detail lives

- **Mechanism and touchpoints** → [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Evidence, lifecycle, and blind spots** → [RESEARCH.md](./RESEARCH.md) · [probes](./probes/README.md)
- **Decision history** → [DECISIONS.md](./DECISIONS.md)
