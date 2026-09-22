# Architecture — agent monitoring control plane

> Mechanism for [`README.md`](./README.md). Realmkeeper remains local-first,
> single-user, and provider-native: this layer observes and routes controls; it
> does not become the agents' runtime or terminal.

## Engineer context

Read `.docs/vision.md`, `.docs/architecture/processes.md`,
`.docs/architecture/events.md`, `.docs/architecture/state.md`,
`src/main/event-bus.ts`, `src/main/provider-sessions.ts`,
`src/shared/traces.ts`, `src/shared/session-capabilities.ts`, and
`src/renderer/src/store-domain/event-reducer.ts` first. Main owns process,
filesystem, socket, and polling side effects. The renderer receives validated
data through preload and typed IPC.

## Product surface

Add a top-level renderer mode:

- **Monitor** is the default operational workspace and the last selected mode
  is remembered locally.
- **Realm** is the current Phaser Star Chart and HUD. It remains fully usable,
  but no longer carries the entire monitoring information architecture.
- Monitor is a full-size React layout, not another tab inside the current
  narrow Kingdom panel.

The Monitor layout has three coordinated regions:

1. **Attention** — blocking, failed, ready-for-review, disconnected, budget,
   and integration-health items, ordered by actionability and age.
2. **Fleet** — one row per reconciled agent, with provider, repository,
   worktree/branch when known, status, current activity, age, usage, source,
   and available actions.
3. **Inspector** — selected agent timeline, evidence behind its status,
   integration diagnostics, usage, and capability-backed controls.

Usage/history and Integrations are secondary Monitor views. Fantasy names may
decorate labels, but operational status and actions use plain language.

## Data model

### `MonitorObservation`

One bounded fact from one source:

- `observationId`, `observedAt`, `expiresAt`
- `sourceId`, `sourceKind`, `authority`, `confidence`
- `providerId: string`, optional Realmkeeper `tool`
- native session reference, source-local agent/pane id, cwd, repo root,
  worktree, branch, model, state, state reason, current activity
- optional reported token/cost counters and source cursor/revision

`providerId` is a string so monitor-only providers such as Antigravity can be
shown without widening the existing four-provider `AgentTool` event contract.
Only a recognized `AgentTool` may enter provider-control IPC.

### `AgentMonitorRecord`

The reconciled row returned to the renderer:

- `agentId`, identity aliases, provider, native session id
- repo/worktree/branch and display label
- `state`: `working | blocked | ready | idle | done | failed | unknown | offline`
- `stateReason`, `authority`, `confidence`, `lastObservedAt`, `freshUntil`
- current activity summary with no raw prompt/tool output by default
- `usage`, `usageCoverage`, `integrationHealth`
- existing `SessionCapabilities` when the record maps to a Realmkeeper tool
- optional Herdr target for focus only

Canonical identity is `providerId + nativeSessionId` when available. Otherwise
it is `sourceId + sourceLocalId`. Repository/cwd is never an identity key:
multiple agents routinely work in one worktree. Aliases can merge records only
when a source explicitly supplies the same native session reference.

### `AttentionItem`

- stable `attentionId` from `kind + agentId + evidence key`
- `kind`: permission, question, stuck, failure, ready, disconnected, budget,
  integration
- severity, title, summary, evidence, source, opened/updated timestamps
- lifecycle: `open | acknowledged | snoozed | resolved`
- supported actions expressed as references to existing permission/session
  controls, plus local acknowledge/snooze/focus actions

Re-emitting the same condition updates one item. Resolution closes it. A later
recurrence reopens the same logical item while retaining its history.

### `UsageRollup`

Roll up by day, provider, repo, model, and session. Every metric carries
`coverage: reported | derived | unavailable` and its source. Provider-reported
cost is preserved; Realmkeeper does not infer money from tokens in this slice.
An unavailable metric renders as unknown, never zero.

### `IntegrationHealth`

Record detected version, configured/installed state, last successful signal,
last error, protocol/schema version, and capabilities. “Configured” and
“observed working” are separate states so hook text alone cannot produce a
green status.

## Source adapters and authority

`MonitorSource` has `start(emit)`, `snapshot()`, `health()`, and `stop()`.
Sources run in Electron main:

1. **Realmkeeper event source** observes the existing event bus, pending
   permission/input requests, errors, and controls.
2. **Provider inventory source** polls the shipped Claude/Codex discovery. All
   four providers still enter through the event source. Cursor/Gemini native
   inventory remains unavailable until their adapters expose a machine-readable
   stable session id; that does not block event- or Herdr-observed rows.
3. **Herdr source** is optional. PR 2 runs non-overlapping `herdr agent list`
   JSON polls every three seconds with a two-second timeout, validates the full
   response, and records `herdr --version`. Two consecutive failures mark the
   source degraded; a later successful poll recovers it. Focus invokes
   `herdr agent focus <pane-id>`. Direct socket subscriptions are a measured
   follow-on, not an alternate v1 implementation. No pane read API is called.
4. **Trace/usage source** extracts provider-reported usage from normalized
   trace attributes and future native OTel inputs.

Status precedence is explicit, and every chosen state retains its evidence:

1. A live Realmkeeper permission or input request is `blocked`.
2. A provider-native lifecycle state wins while fresh.
3. An authoritative Herdr lifecycle report wins over terminal heuristics.
4. Herdr screen-manifest state wins over Realmkeeper event-age heuristics.
5. Recent normalized events may infer `working`; expired evidence becomes
   `unknown`, then `offline` after the source-specific grace period.

Freshness is fixed for v1 rather than left to each adapter:

| Evidence | Fresh through | Then | Offline/dismissed |
|---|---:|---|---:|
| Pending permission/input | until resolution or provider disconnect | blocked | on resolution/disconnect |
| Herdr poll | 10 seconds from successful poll | unknown | 30 seconds |
| Claude/Codex inventory | 15 seconds from successful poll | unknown | 60 seconds |
| Normalized activity event | 30 seconds from event | unknown | 5 minutes without another source |
| Explicit session end/failure | durable terminal state | done/failed | retained 24 hours by default |

Polls never overlap. A source-wide failure expires confidence by the same table
but does not synthesize per-agent completion. These values are configuration
constants covered by fake-clock tests; user tuning is out of scope for v1.

Conflicting sources do not silently overwrite each other. The record exposes
the winner, losing observations, timestamps, and a diagnostic reason.

Herdr remains optional. Missing binary, stopped server, incompatible protocol,
or permission-denied socket access degrades one source and creates at most one
integration attention item. Native Realmkeeper sources continue operating.

## Write path

1. A source emits a validated `MonitorObservation`.
2. `MonitorService` deduplicates by observation id/revision and appends one
   metadata-only journal record.
3. The reconciler updates affected `AgentMonitorRecord` values and evaluates
   attention transitions.
4. Usage counters update daily rollups only when the source declares coverage.
5. Main publishes a versioned delta; renderer requests a full snapshot after
   launch, reconnect, or version gap.

No prompt, assistant response, tool argument/result, pane output, or terminal
scrollback enters monitoring persistence under the default policy. Existing
conversation/trace views remain responsible for content.

## Read and action path

The preload exposes validated snapshot/delta APIs. Proposed IPC additions:

- `rw:get-monitor-snapshot`
- `rw:monitor-delta` (main → renderer)
- `rw:update-attention` for acknowledge/snooze only
- `rw:focus-monitor-agent` for Realm focus, native attach, or Herdr focus
- `rw:get-monitor-history` with bounded date/agent filters

Interventions do not create a second control plane:

- permission and user-input answers reuse their existing typed IPC
- send/steer/interrupt/stop/fork/attach/logs reuse `rw:control-session`
- unsupported controls display `SessionCapabilities.reason`
- Herdr v1 can focus/attach the target pane; it does not send prompts or raw
  keystrokes from Realmkeeper

Every action emits the existing `session_control` or permission-resolution
event so the monitor shows success/failure in the same timeline.

## Persistence and retention

Use the existing low-dependency JSON practice for the first slice:

- `~/.realmkeeper/monitor/state.json` — atomic current snapshot plus attention
  acknowledgement/snooze state
- `~/.realmkeeper/monitor/history/YYYY-MM-DD.jsonl` — each compact metadata
  observation once
- `~/.realmkeeper/monitor/usage/YYYY-MM-DD.json` — compact daily rollups

Default retention is 30 days for history and usage, configurable from 1–365.
Pruning is idempotent and never deletes provider transcripts. Schema versions
use explicit forward migrations and a corrupt file is quarantined before an
empty replacement is created.

Do not extend the current whole-trace-per-event JSONL as the monitoring index:
the scale probe measured 97.96× byte amplification. Existing trace files stay
readable/exportable. A later migration may compact them, but Monitor writes its
own metadata journal once per observation.

SQLite is not introduced until the build-gated 100,000-observation probe shows
JSON cannot meet the stated startup/query/disk budgets. This keeps Electron
packaging free of a new native dependency while the actual personal-scale
constraint is still small.

## UI behavior

- Default sort: blocking, failed, ready, working, idle/unknown/offline; within
  a state, oldest attention first and newest activity second.
- Filters: provider, repo/worktree, state, attention kind, source, time range.
- Empty state explains how to connect hooks or Herdr and offers fixture mode.
- Status chips always have a textual label; color is supplementary.
- Unknown/stale state is visually distinct from idle/done.
- Attention actions are reachable by keyboard and confirm destructive stops.
- Selecting a fleet row never changes process state. Action buttons are
  separate, capability-gated controls.

## Touchpoints

| File/area | Change | Call sites |
|---|---|---|
| `.docs/vision.md` | Make Monitor the primary operational workspace | product constitution |
| `src/shared/schemas/monitoring.ts` | Schemas for observations, snapshots, attention, usage, health | main, preload, renderer, tests |
| `src/main/monitoring/` | Service, reconciler, sources, persistence, retention | app lifecycle, event bus, provider inventory |
| `src/shared/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts` | Typed monitor snapshot/delta/history/local-attention IPC | Monitor UI |
| `src/renderer/src/monitoring/` | Monitor shell, attention, fleet, inspector, usage, integrations | `App.tsx`, panel/store routing |
| `src/shared/session-capabilities.ts` | Map reconciled rows to existing controls | Fleet and Inspector actions |
| `src/main/trace-store.ts` | Read compatibility only; no new monitoring writes | history/trace links |
| `tests/e2e/` | Packaged monitor, restart, degraded-source, privacy, visual tests | CI |

## Invariants

- Provider processes remain usable if Realmkeeper or Herdr exits.
- Missing/incompatible sources reduce confidence; they do not crash the app or
  fabricate idle/success.
- One native provider session produces at most one fleet row.
- A visible action is either supported now or disabled with the concrete
  reason; it never relies on optimistic provider parity.
- Default persistence contains metadata and summaries only.
- Source polling is bounded, cancellable, and stopped during Electron cleanup.
- IPC uses `safeHandle`, request/response schemas, and sender-frame validation.
