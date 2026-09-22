# 0.9.0 plan reconciliation and next-release priorities

Reviewed 2026-09-22 against release commit `96c8013`. This is a delivery audit
and recommendation, not a new Ready-to-ticket implementation plan.
Back to the [plan index](./README.md).

## Post-release implementation checkpoint — working tree

The first safety slice now pauses fix-then-test after response/session-end
capture with an explicit unverified-success reason. Resume and restart cannot
convert that capture into successful verification or resend the prompt.
Template copy no longer promises an automatic retry/verification loop or
enforced source-trace handoff guards. Existing completed run records are not
rewritten. The release findings below still describe 0.9.0, not this new code.

Independent review found no defect in the narrow safety change. Regression
coverage exercises response/end after FAIL, claimed PASS, or missing tool
output, scheduler resume, disk reload/recovery, and single-send behavior.
Five source-build Electron orchestration tests pass, including visible pause
and Resume behavior. Automatic verification and durable monitoring remain
future implementation; this checkpoint is not a
new release or a claim that the entire roadmap is complete.

The next working-tree increment connects Realm agent activity and Monitor to
one app-lifetime read replica. Main owns state/freshness; both views share
provider/native identity, reason, and version recovery. Realm captions,
activity cards, ask navigation, working effects, and party activity update from
that snapshot. Unknown evidence does not fall back to old unit status. Existing
game pressure, HP/MP, world seals, and historical poses remain game mechanics,
not a second source of operational truth. Persistent history is still unbuilt.

Shared-state verification: 394 unit/component/asset tests, all 24 source-build
Electron E2E tests, typecheck, lint, production build, and diff whitespace
checks pass. Visual QA fixtures now explicitly seed both stores; production
never falls back to those synthetic derivations. The map click test targets
the rendered activity label instead of a fixed coordinate. Rendered overview
and inspector screenshots were reviewed. The packaged 0.9.0 artifact was not
rebuilt or republished for these uncommitted changes.

## What is actually delivered

| Track | Delivered | Still pending |
|---|---|---|
| [Monitoring](./agent-observability-control-plane/) | Main-owned reconciliation, event/native inventory sources, optional Herdr presence/focus, Attention/Fleet/Inspector, validated snapshots/deltas, packaged Monitor smoke | Durable attention/history/usage, complete intervention/restart/privacy/performance gates, Realm parity |
| [Session controls](./session-control-plane/) | Capability registry, typed fail-closed controls, Codex list/fork, Claude discovery/attach/logs, fixture failure coverage | Claude native background stop/respawn, Cursor inventory/authoritative IDE control, Gemini ACP/auth probes |
| [Orchestration](./agent-orchestration-workflows/) | Durable local runs, main-owned scheduling, Run Board, response checkpoints, permission/input pauses, iteration/runtime limits, restart pause | Verified fix/test outcomes, source-trace handoff guards, stuck/loop/slow-tool pauses, process-level recovery validation |
| Realm presentation | Connected themed map, district/workstation placement, activity/attention visuals, density layout, camera/minimap, overlay/selection polish | Consistent operational truth with Monitor; evidence-driven usability checks, not another speculative scenery rewrite |

The release includes substantial foundations. “Everything in the original
plans is complete” is not supported. Schema fields and template descriptions
are not evidence that their runtime behavior exists.

## Current-code evidence — Tier 3

- `src/main/monitoring/monitor-service.ts` stores observations, slots, and
  integrations in memory. `monitor-reconciler.ts` derives open attention;
  acknowledgement/snooze schema values do not provide mutation or persistence.
- `src/main/monitoring/monitor-reconciler.ts` selects available usage or marks
  it unavailable; daily rollups/history are absent. Inspector distinguishes
  unknown usage rather than substituting zero.
- `src/renderer/src/game/session-activity.ts` has a 120-second stale activity
  threshold; `src/main/monitoring/monitor-policy.ts` uses 30-second event
  freshness. These are different projections, not proof of identical semantics.
  Reuse the reconciled operational model while retaining cosmetic/game state.
- `src/main/monitoring/monitor-runtime.ts` polls inventory every 15 seconds.
  The plan's five-second provider-lifecycle target is not met for inventory-only
  changes. Measure and fix scheduling before claiming that gate passes.
- `tests/e2e/specs/monitor-workspace.spec.ts` already exercises fleet,
  attention, inspector evidence, filters, and Realm switching. It does not
  establish restart persistence or every provider intervention.
- `src/main/orchestration-engine.ts` sends a composed fix/test prompt and
  can complete on assistant text or session end. This does not prove the
  verification command passed, despite `src/shared/orchestration-templates.ts`
  promising that success gate. Source trace IDs are prompt context, not an
  enforced unresolved-permission guard. Trace-monitor pauses are not wired.
- `src/main/orchestration-store.ts` pauses running work after restart for manual
  validation. `orchestration-store.test.ts` covers temp-store recovery, not
  automatic safe continuation of a live provider across process restart.

## Recommended next release — graded priorities

1. **Correct misleading workflow success contracts first.** A collected response
   must not imply verified task/test success. Reconcile template copy and run
   outcome semantics, then implement evidence-backed gates where supported.
   Acceptance: early assistant text, failing tests, missing verification, and
   unresolved source-trace requests cannot yield verified success.
2. **One operational truth across Monitor and Realm.** Main owns identity,
   authority, freshness, and blocking state; the renderer maps it into plain
   labels and themed cues. Keep character assets unchanged. Acceptance: fake-clock
   and Electron fixtures show matching blocked/working/unknown/offline/terminal
   meaning across both views, including duplicate sources and source outages.
3. **Durable attention and compact history.** Build the already-planned
   acknowledgement/snooze lifecycle, metadata journal, restart hydration,
   corruption handling, and retention. Acknowledgement must never approve or
   dismiss a live provider permission. Acceptance: restart, recurrence, snooze
   expiry, duplicate observations, corrupt files, and retention tests.
4. **Coverage-aware usage.** Add deduplicated daily provider/session rollups;
   unknown remains unknown. Preserve reported cost only, without estimated
   pricing. Acceptance: replay/restart never doubles counters, counter resets
   are handled, and partial provider coverage remains visible.
5. **Prove daily-use reliability.** Expand packaged E2E to interventions,
   restart, degraded sources, keyboard navigation, and specified viewport sizes.
   Measure the existing 100-agent and 100,000-observation budgets. Inject a
   synthetic sentinel into fixture prompt/tool content and verify its absence
   from persisted monitor files and exports. Resolve the
   five-second inventory target without overlapping or unbounded polling.

These are recommended work units, not a promise they all fit one release.
The smallest useful next increment is truthful outcomes plus cross-view state
parity. Persistence follows on the same main-owned model, not a second runtime.
Reuse existing schemas, safeHandle/preload boundaries, capability controls,
and local JSON practice; add no external workflow engine or database merely
to modernize the stack.

## Deferred / needs fresh evidence

- Additional provider controls require current contract probes and disposable
  sessions; historical July auth/CLI results are not current compatibility.
- Automated cross-provider ranking, monetary budget enforcement without usage
  coverage, remote/mobile control, and a replacement agent runtime stay out.
- More Realm artwork is lower priority than truthful state, readable attention,
  and measured navigation/density issues. Preserve the established fantasy
  theme and characters.
- The published DMG is Apple Silicon only, unsigned, and not notarized.
  Signing/notarization needs credentials before broad public distribution;
  auto-update and additional platform installers are separate scope.

## Verification and limits

Release verification recorded in [0.9.0 notes](../releases/0.9.0.md): 382 tests,
23 source Electron E2E, 23 actual packaged-app E2E, typecheck, lint, skills
audit, production/DMG build, and DMG integrity check passed before publication.
These are fixture-based regression checks, not proof of every live provider.

This audit additionally reran source probe 01 and synthetic probe 03 (Tier 2):
legacy Observatory still has a 500-event window; inventory is Claude/Codex;
1,224 trace snapshots parse and amplify bytes 97.96× on the synthetic fixture.
An independent worker ran 45 tests across seven orchestration, session-control,
and monitoring test files. No live provider mutation, new CLI-version research,
or refreshed real-transcript/Herdr population measurement was performed.

The research-plan skill's independent audit reopened orchestration contract
gaps that the old status banner hid. Its mechanical gate initially reported
one monitoring, four session, and three orchestration failing boxes. Including
graded gaps/acceptance failures, initial queues were 3, 5, and 5 respectively.
Remaining research-format/provenance and live-evidence gaps are not excused by
the passing product tests. No plan receives a new Ready stamp in this review.

### Audit loop outcome

| Pass | Monitoring queue | Session queue | Orchestration queue |
|---|---:|---:|---:|
| Initial independent audit | 3 | 5 | 5 |
| Delivery corrections and independent re-audit, wording fixes applied | 1 | 4 | 5 |
| README caps and reciprocal registration repaired | 1 | 2 | 3 |

Final mechanical failures: monitoring `staleness` (cited H7/H9 retain old
stamps); session and orchestration `probe-backed` / `sha-stamped` adoption or
missing provenance. Orchestration additionally retains graded
`gate-measurable`: its original acceptance section needs explicit verified
outcome, source-trace guard, and monitor-pause tests before implementation.
The priority list above supplies direction, not that completed design.

The independent re-audit confirmed the delivery report against code; final
caps/link repairs were checked mechanically. Research snapshot records were
published under each plan's `.research-runs/` directory. This documentation
checkpoint stops short of certifying new provider contracts or new runtime
features: refresh the required live evidence and resolve the focused acceptance
gates when advancing those implementation tracks. Plan edits are post-release
working-tree changes; they do not alter the published 0.9.0 tag.
