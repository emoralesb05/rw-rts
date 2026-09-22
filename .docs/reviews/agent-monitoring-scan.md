# Scan Report: agent monitoring

**Scanned:** 2026-09-21  
**Scope:** `src/main/monitoring/`, `src/renderer/src/monitoring/`, shared
monitor schemas/order, preload and main IPC touchpoints  
**Stack:** Electron 41, TypeScript 6, React 19, Zod 4, Vitest 4  
**Guidance:** repository architecture, Electron skill, general module scan

## Summary

| Category | Open | Resolved during scan |
|---|---:|---:|
| Performance | 1 | 2 |
| Security | 0 | 2 |
| Quality | 2 | 4 |

**Assessment:** The first Monitor slice now follows Realmkeeper's documented
main/preload/renderer boundary and is a sound base for iteration. It is an
operational alpha, not a completed observability system: persistence, usage,
and packaged Monitor-specific E2E coverage remain intentionally open.

## Open findings

### Performance

#### P1 — Snapshot diffing serializes full visible state

- **File:** `src/main/monitoring/monitor-service.ts`
- **Issue:** freshness ticks and publishes compare visible snapshots with
  `JSON.stringify`; delta generation also serializes rows individually.
- **Impact:** negligible at the measured personal scale (dozens of agents), but
  work grows with evidence and fleet size.
- **Next:** benchmark with the planned 100,000-observation probe before adding
  hashing or per-agent dirty tracking. Avoid complexity until the budget fails.

### Quality

#### Q1 — Monitor-specific packaged E2E coverage is not shipped

- **Area:** `tests/e2e/`
- **Risk:** unit tests validate reconciliation and delta gaps, while packaged
  navigation, source degradation, privacy, and focus still rely on manual
  runtime checks.
- **Next:** add deterministic provider/Herdr fixtures and packaged tests for
  Monitor default mode, blocked-first ordering, stale transitions, and Realm
  switching.

#### Q2 — Durable attention/history/usage is not implemented

- **Area:** `src/main/monitoring/`
- **Risk:** monitor state resets with the process and usage remains explicitly
  unavailable.
- **Next:** implement the bounded metadata journal and daily rollups specified
  in the active architecture plan; do not reuse cumulative trace snapshots.

## Resolved during scan

- Split the 679-line service into runtime, policy, source normalization,
  reconciliation, and service modules; all are below 300 lines.
- Split the 795-line workspace into Attention, Fleet, Inspector, controls, and
  formatting modules; all are below 300 lines.
- Centralized agent ordering so main snapshots and renderer deltas cannot
  disagree about blocked-first ordering.
- Moved polling orchestration and cleanup behind `MonitorRuntime`; provider and
  Herdr polls are asynchronous, non-overlapping, bounded, and ignore late
  results after shutdown.
- Kept Herdr focus fail-closed: renderer supplies an agent id and main resolves
  the validated pane target from current monitor state before invoking
  `execFile` with an argument array.
- Preserved metadata-only monitoring: Codex preview-derived labels are removed
  and Herdr never reads pane titles, output, or scrollback.

## Good practices confirmed

- Main owns CLI processes, polling, reconciliation, and source health.
- Snapshot, delta, and focus IPC use shared Zod contracts, preload validation,
  `safeHandle`, and sender-frame checks.
- Provider-native identity is canonical; cwd/repository never merges agents.
- Authority and freshness are explicit, and conflicting evidence stays visible.
- Capability-gated controls reuse the existing session-control path.
- Missing Herdr, Cursor inventory, or Gemini inventory degrades only that
  integration and does not disable native sources.

## Verification

- TypeScript: node, renderer, and E2E projects pass.
- Unit tests: 54 files, 293 tests pass.
- Production Electron build passes.
- ESLint, Stylelint, changed-file Prettier, and `git diff --check` pass.
- Fresh Electron launch remained error-free through multiple Herdr poll cycles.

The repository-wide Prettier command still reports four pre-existing files
outside this change (`src/shared/orchestration.ts`, two trace-export files, and
`tests/e2e/specs/observatory.spec.ts`). They were intentionally not rewritten
as part of this module audit.
