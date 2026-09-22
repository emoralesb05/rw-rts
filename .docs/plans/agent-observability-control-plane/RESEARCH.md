# Research — agent monitoring control plane

> Backs the decisions in [`README.md`](./README.md). Snapshot
> `7a9f781+8cd863dc9ce0` was published before these findings were stamped.
> Historical H1–H5/D1–D2 are preserved from the shipped 2026-07 plan; their
> lifecycle now records what the implementation changed. Final independent
> audit at `7a9f781+ebb949c81de6`: seven mechanical and six graded boxes passed.

## Findings

### H1 — Production observability products converge on trace/span records <a id="h1"></a>
> `probe R1` · **asserted** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **SUPERSEDED** by [H10](#h10)

The original scan correctly motivated trace projection, which shipped. It did
not study coding-agent fleet presence, terminal state, attention routing, or
usage-first dashboards, so it no longer settles the next product slice.

### H2 — OTel GenAI is useful vocabulary but not Realmkeeper's product model <a id="h2"></a>
> `probe R2` · **decided** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

OTel remains the export/interchange vocabulary. The user-facing monitor needs
agent identity, freshness, source authority, attention lifecycle, and control
capabilities that are not supplied by raw spans alone. Sensitive content stays
opt-in. Sources: [OTel GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/), [Gemini CLI telemetry](https://geminicli.com/docs/cli/telemetry/).

### H3 — Durable orchestration concepts are outside this monitoring slice <a id="h3"></a>
> `probe R3` · **decided** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **RETIRED**

The orchestration plan shipped its first slice. This plan may display runs and
their attention state, but it does not add workflows, automated judging, or a
replacement runtime.

### H4 — Realmkeeper has an event spine but no trace model <a id="h4"></a>
> `probe L1` · **asserted** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **REVERSED** by [H6](#h6)
>
> This looked right in July because only the flat `AgentEvent` path existed.
> The shipped observability work subsequently added trace/span projection,
> persistence, monitors, usage attributes, export, and UI. The next gap is that
> those pieces remain renderer-window-bound and not fleet-oriented.

### H5 — A Collector accepted the original OTLP/HTTP JSON export <a id="h5"></a>
> `probe otel-collector-validation-2026-07-03` · **asserted** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **STALE**

The legacy probe recorded HTTP 200 for one trace and three spans. It predates
the current snapshot standard and was not rerun because external export is not
load-bearing for this monitoring plan. Receiver compatibility remains useful
history, not evidence of strict semantic-convention or vendor compatibility.

### D1 — Realmkeeper stays local-first and vendor-optional <a id="d1"></a>
> `—` · **decided** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

No hosted account, telemetry backend, or Herdr installation is required. Local
state is useful on its own; external systems are optional sources or exports.

### D2 — Content capture remains opt-in <a id="d2"></a>
> `—` · **decided** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

Monitoring persistence defaults to metadata, bounded summaries, counts, and
status evidence. Prompt text, tool arguments/results, terminal scrollback, and
file contents are excluded unless a future explicit setting says otherwise.

### H6 — The shipped Observatory is limited to the renderer's 500-event window <a id="h6"></a>
> `probe 01` · **measured** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

Source inspection found four hard-coded monitor kinds, a 500-event renderer
cap, bounded Observatory lists, `projectTraces(events)` in the renderer, and no
trace-store hydration in `startTraceStore()`. It also confirmed the store
appends the entire projected trace after every event. A restart therefore loses
the active Observatory model even though JSONL files remain on disk.

### H7 — Provider discovery is partial, but safe intervention already has a typed seam <a id="h7"></a>
> `probe 01` · **measured** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

`listProviderSessions()` implements Claude and Codex and emits
`not_implemented` for Cursor and Gemini. The shared capability registry already
names ten controls and gives provider/session-specific availability reasons.
The monitor should compose that registry rather than create a parallel action
system.

### H8 — Herdr can supply live identity and state without pane content <a id="h8"></a>
> `probe 02` · **measured** · production sweep 2026-09-21 — re-measure by 2026-10-21 · **LIVE**

The read-only local query returned seven agents: five Claude and two Codex;
three working, three idle, and one done. Six carried native session references,
and the response contained no content/output/scrollback fields. The sample did
not include blocked, Cursor, Gemini, or Antigravity agents.

Herdr documents a snapshot/event API, source authority, `idle/working/blocked/
done/unknown` states, native session references, and focus operations. Realmkeeper
can therefore use it as an optional presence/focus source without reading or
controlling terminal content. Sources: [agents](https://herdr.dev/docs/agents/), [socket API](https://herdr.dev/docs/socket-api/), [CLI reference](https://herdr.dev/docs/cli-reference/).

### H9 — Whole-trace snapshots amplify bytes 97.96× synthetic and 1.51× on real transcript shapes <a id="h9"></a>
> `probe 03/04` · **measured** · `7a9f781+8f746947cfd5` · 2026-09-21 · **LIVE**

For 12 deterministic sessions with 25 four-event turns, appending each event
once used 245,321 bytes; appending the current whole trace after every event
used 24,030,716 bytes across the same 1,224 lines. All snapshots parsed. This
does not predict real compression or filesystem overhead.

The real-data correction sampled 119 parsed assistant events across 12 recent
local Claude/Codex transcripts, reading 25,396,922 bytes without emitting
content or identifiers. Normalized events occupied 92,336 bytes and cumulative
trace snapshots 139,350 bytes: 1.51× amplification, 96.45 points lower than the
synthetic ratio. The real sample excludes hook-only tool/permission events, so
it corrects synthetic optimism without claiming a complete production mix.

### H10 — Prior art separates terminal presence, coding-agent usage, and LLM traces <a id="h10"></a>
> `—` · **decided** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

Herdr owns persistent panes, lifecycle state, native session restoration,
focus, and automation. AgentGlass combines attention, approvals, repository
context, cost/tokens, and local/phone interaction. TokenTelemetry emphasizes
local multi-agent usage, quota/budget coverage, trace waterfalls, and explicit
unknowns. CloudWatch Coding Agent Insights consumes native OTel metrics from
coding agents. Langfuse/Phoenix/Opik show the deeper trace/evaluation layer.

Realmkeeper should specialize in local cross-source attention, explainable
state, and safe provider controls; it should integrate rather than clone a
terminal multiplexer or hosted observability suite. Sources:
[Herdr automation](https://herdr.dev/docs/agent-automation/),
[AgentGlass](https://github.com/SirAllap/agentglass),
[TokenTelemetry](https://github.com/VasiHemanth/tokentelemetry),
[CloudWatch Coding Agent Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/coding-agents-insights.html),
[Langfuse sessions](https://langfuse.com/docs/observability/features/sessions),
[Phoenix](https://arize.com/docs/phoenix/),
[Opik monitoring](https://www.comet.com/docs/opik/tracing/dashboards/production_monitoring).

### H11 — Monitoring, not orchestration or game presentation, is the primary workflow <a id="h11"></a>
> `—` · **decided** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

The requested outcome is to see and interact with agents as needed, mostly to
monitor them. The product keeps its distinctive Realm view, but its primary
operational information architecture becomes Attention → Fleet → Inspector.
This decision requires the accompanying `.docs/vision.md` update before code.

### H12 — State reconciliation must expose authority, freshness, and conflict <a id="h12"></a>
> `—` · **decided** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

Provider hooks, provider inventories, Herdr lifecycle hooks, Herdr screen
manifests, and recent-event heuristics can disagree. The main process chooses
with documented precedence and TTLs, retains losing observations, and tells the
renderer why a state won. Expired evidence becomes unknown/offline, not idle.

### H13 — Persist compact monitor observations and rollups, not another trace database <a id="h13"></a>
> `—` · **decided** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

Append each metadata observation once, checkpoint current monitor/attention
state atomically, and write daily usage rollups. Keep existing trace export
compatible. Introduce SQLite only if the build-gated 100,000-observation probe
misses the explicit JSON budgets; a native dependency is not justified yet.

### H14 — Usage must carry coverage instead of implying completeness <a id="h14"></a>
> `—` · **decided** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

Native coding-agent telemetry can expose tokens, latency, tool calls, API
requests, and approvals, but availability differs by provider and local config.
Each metric is reported, derived, or unavailable. Provider-reported cost is
shown; cost estimation and pricing-version maintenance are out of scope.
Sources: [Gemini CLI telemetry](https://geminicli.com/docs/cli/telemetry/),
[CloudWatch Coding Agent Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/coding-agents-insights.html).

### H15 — Interaction must reuse the capability and permission control planes <a id="h15"></a>
> `—` · **decided** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

Monitor may acknowledge/snooze its own attention items and focus a Herdr pane.
All provider actions reuse existing typed controls and permission resolution so
they remain fail-closed, observable, and provider-specific. Herdr raw prompt or
keystroke injection is excluded from the first slice.

### H16 — Accuracy, privacy, and scale remain build-gated <a id="h16"></a>
> `—` · **build-gated** · `7a9f781+8cd863dc9ce0` · 2026-09-21 · **LIVE**

Only the implementation can prove identity dedupe, status latency, retention,
sentinel-secret exclusion, 100-agent reconciliation, 30-day hydration, or UI
clipping. These are acceptance tests, not claims the plan marks measured.

## Probe → finding map

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| `01-current-monitoring-surface.mjs` | What can the shipped monitor see and retain? | H6, H7 | no |
| `02-live-herdr-feasibility.mjs` | Can Herdr expose metadata-only live state? | H8 | running local Herdr |
| `03-trace-snapshot-amplification.mjs` | Is whole-trace-per-event JSONL suitable for history? | H9 | no |
| `04-real-transcript-amplification.mjs` | Does amplification persist on real local provider transcript shapes? | H9 | local transcripts |
| `otel-collector-validation-2026-07-03.mjs` | Did the legacy OTLP JSON reach a Collector? | H5 (stale/asserted) | Docker |

## Verification log

| Finding | Verdict | Note |
|---|---|---|
| H6 | `holds` | Independent Tier 2/3 check observed four monitor kinds, the 500-event window, bounded lists, renderer projection, whole-trace append, and no startup hydration. |
| H7 | `holds` | Independent Tier 2/3 check observed Claude/Codex discovery, Cursor/Gemini `not_implemented`, and ten capability-gated controls. |
| H8 | `holds` | Independent live check observed seven agents, valid states, six native references, and zero content fields; the volatile state split changed without refuting the capability. |
| H9 | `holds` | Independent checks reproduced 97.96× synthetic amplification and the separate 12-session/119-event real correction at 1.51×; all 1,343 snapshots parsed and aggregate-only output exposed no content or identifiers. |

## Coverage gaps — what this does NOT validate

- **Real-data coverage:** the live Herdr sample has seven Claude/Codex agents,
  no blocked state, and no Cursor/Gemini/Antigravity agent.
- **Build-gated:** identity reconciliation, UI latency, storage budgets,
  attention lifecycle, and privacy sentinel require the implementation.
- **Usage blind spot:** no provider emitted a complete cross-provider token and
  cost sample during this plan pass.
- **Herdr coupling:** feasibility was measured on Herdr 0.9.1; protocol changes
  require negotiation and the 2026-10-21 re-measure trigger.
- **Legacy evidence:** H5 lacks modern provenance and is deliberately not used
  by a current decision.
- **Real-data scope:** H9's correction sees provider-persisted assistant text,
  not hook-only tool/permission events, filesystem compression, or query latency.
- **Out of scope:** prompt/output full-text search, eval scoring, remote/mobile
  control, terminal emulation, and autonomous workflow ranking.
