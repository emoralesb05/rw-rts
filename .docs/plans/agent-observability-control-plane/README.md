# Agent monitoring control plane — see every agent, notice what needs attention, and intervene safely

> **Status:** 🚧 In implementation — the first Monitor vertical slice is built and verified; persistence, Herdr, and richer attention/usage remain.
> **Owner:** TBD
> **Drafted:** 2026-07-03 · **Last updated:** 2026-09-21 (closed three audit failures; re-verified H6–H9)
> **Scope:** Unified local fleet state, attention, usage, history, integration health, and safe intervention; not a terminal multiplexer or autonomous project manager.
> **Effort:** 5 PRs, large
> **Start here:** README.md, ARCHITECTURE.md, RESEARCH.md, probes/README.md
> **Detail:** [ARCHITECTURE](./ARCHITECTURE.md) · [RESEARCH](./RESEARCH.md) · [DECISIONS](./DECISIONS.md) · [probes](./probes/README.md)
> **Related:** [session control](../session-control-plane/) · [orchestration workflows](../agent-orchestration-workflows/)

## What this is and why now

Realmkeeper can already normalize events, project traces, raise four monitor
signals, list some provider sessions, and issue capability-gated controls. The
pieces do not yet form a dependable monitor: the Observatory only sees the
renderer’s 500-event window, does not hydrate history after restart, truncates
its most important lists, and discovers provider-native sessions only for
Claude and Codex.

The next product slice makes monitoring the primary operational surface. A
single fleet view answers: what is running, what needs me, what changed, what
did it consume, how trustworthy is that state, and what can I do now? The Star
Chart remains available as the atmospheric Realm view. Existing provider CLIs
remain the execution authority.

Herdr is an optional high-quality presence source for agents running in its
panes. Realmkeeper does not require it and does not reproduce its terminal,
worktree, or remote-session substrate.

## Implementation checkpoint — 2026-09-21

Shipped in the working tree:

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
- live verification against 36 local Claude/Codex sessions, six Herdr panes,
  and a blocking permission fixture at 1280×720.

Next: durable attention/history/usage persistence and packaged
Monitor-specific E2E coverage.

## What we decided

| # | Decision | Settled by |
|---|---|---|
| 1 | ✅ Make Monitor the primary operational workspace; retain Star Chart as Realm view. | [H11](./RESEARCH.md#h11) |
| 2 | ✅ Reconcile observations in Electron main with explicit source authority and freshness. | [H12](./RESEARCH.md#h12) |
| 3 | ✅ Support Herdr as optional read-only presence/focus integration, never a runtime requirement. | [H8](./RESEARCH.md#h8), [H10](./RESEARCH.md#h10) |
| 4 | ✅ Reuse typed session-control and permission paths for interventions. | [H7](./RESEARCH.md#h7), [H15](./RESEARCH.md#h15) |
| 5 | ✅ Persist compact metadata observations and rollups once; do not use whole-trace snapshots as the monitoring history. | [H9](./RESEARCH.md#h9), [H13](./RESEARCH.md#h13) |
| 6 | ✅ Show reported, derived, and unavailable usage separately; never present unknown as zero. | [H14](./RESEARCH.md#h14) |

## What ships, in order

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
