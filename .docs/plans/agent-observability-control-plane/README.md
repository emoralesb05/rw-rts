# Agent Observability Control Plane

> **Status:** 📋 Plan
> **Owner:** TBD
> **Drafted:** 2026-07-03 · **Last updated:** 2026-07-03 (monitor letters shipped)
> **Engineer profile:** Senior TypeScript/Electron engineer — event modeling, local persistence, renderer state; read `.docs/architecture/events.md`, `.docs/architecture/bridge.md`, `.docs/architecture/state.md`, `src/shared/schemas/events.ts`, `src/main/event-bus.ts`, and `src/renderer/src/store-domain/event-reducer.ts` first
> **Effort:** 4 PRs, medium
> **Scope:** Add local-first trace/session observability on top of Realmkeeper's existing event bus · **Origin:** Follow-on from provider hardening and parity work
> **Related:** [`../session-control-plane/`](../session-control-plane/), [`../agent-orchestration-workflows/`](../agent-orchestration-workflows/), [`../../architecture/events.md`](../../architecture/events.md), [`../../architecture/bridge.md`](../../architecture/bridge.md), [`../../providers/`](../../providers/), [`./RESEARCH.md`](./RESEARCH.md), `src/shared/schemas/events.ts`, `src/main/event-bus.ts`, `src/renderer/src/store.ts`

## TL;DR

Realmkeeper already observes agent activity as a live flat event stream. The
industry pattern has moved toward trace/span views, grouped conversations,
durable checkpoints, cost/latency metrics, and human-intervention monitors.

Build a local-first observability layer before adding any cloud exporter:
derive spans from existing provider events, persist redacted trace records,
show session health in the Kingdom panel, and only then add optional
OTel-shaped export.

## Decision

- ✅ **Use Realmkeeper's event bus as the source of truth, not a new
  orchestrator runtime.** The app's north star is to watch and intervene in
  provider-native sessions, not replace Claude/Codex/Cursor/Gemini control
  flow. LangGraph-style explicit workflows are relevant as a mental model
  for state, interrupts, and recovery, but Realmkeeper should remain a
  local observability/control plane over heterogeneous CLIs.

- ✅ **Model traces locally as derived records first.** LangSmith, Langfuse,
  Phoenix, and OpenAI Agents all center on trace/span records, but
  Realmkeeper should not require a hosted account or API key. Add an
  internal `TraceRecord`/`SpanRecord` projection from `AgentEvent` and persist
  it under `~/.realmkeeper/traces/` before considering external export.

- ✅ **Adopt OTel-compatible naming where it fits, without blocking on full
  compliance.** Use concepts like `traceId`, `spanId`, `parentSpanId`,
  `gen_ai.operation.name`, provider, conversation id, tool name, error type,
  token usage, and duration. Store sensitive prompt/tool content separately
  and make full-content capture opt-in.

- ✅ **Start with monitoring signals the King can act on.** First-class
  signals: waiting approval/input age, stuck running session, repeated errors,
  slow tool, loop-like tool repetition, subagent tree, provider exit/error,
  and token/cost totals when providers expose them. Avoid dashboard noise that
  does not map to a player action.

- ✅ **Export is a later adapter.** Once local traces are useful, add an
  OTel-ish JSON export and possibly OTLP/third-party processors. Do not wire
  LangSmith/Langfuse/Phoenix/OpenAI as required runtime dependencies.

## PR sequence

1. **Trace projection schema** — Add `src/shared/traces.ts` with
   `TraceRecord`, `SpanRecord`, and redaction policy types. Add a pure
   projector that maps `AgentEvent[]` into traces grouped by
   `(tool, sessionId)` and spans for session, prompt turn, tool execution,
   permission/input wait, subagent, and error.

2. **Durable local trace store** — Add an append-only JSONL trace store under
   `~/.realmkeeper/traces/YYYY-MM-DD.jsonl` plus in-memory indexes for current
   sessions. Keep raw `AgentEvent` unchanged at first; persist projected
   trace records with stable event ids and redacted content metadata.

3. **Kingdom Observatory view** — Add a compact Kingdom panel tab or section
   showing active traces, blocked/waiting sessions, slow tools, error streaks,
   subagent trees, and provider cost/token totals when known. Link each row to
   existing world/wielder focus and chat drawer behavior.

4. **Monitor rules and export seam** — Add local monitor rules that emit
   low-noise letters for actionable anomalies. Add a manual export command
   that writes OTel-shaped JSON for a selected session/day, with full content
   excluded unless an explicit setting enables it.

## Implementation progress

Shipped on `main`:

- `TraceRecord`/`SpanRecord` projection from the flat AgentEvent stream,
  covering sessions, prompt turns, tools, permission waits, user-input waits,
  subagents, session-control events, errors, and orchestration run events.
- Local trace store under `~/.realmkeeper/traces/` with day export support.
- Kingdom Observatory tab with trace counts, active waits, monitor signals,
  recent errors, trace sessions, and manual metadata-only OTel-shaped export.
- Monitor signals for waiting, slow tool, stale trace, and recent error states.
- Low-noise monitor letters for actionable anomalies. Permission/input waits
  reuse the existing blocking letters when present; slow tools, stale traces,
  and recent trace errors produce bounded, dismissible letters with send-word
  and recall actions where a wielder is known.
- Orchestration lifecycle/checkpoint/budget events flow through the same
  AgentEvent/trace/export path.

Still active:

- Add fixture/e2e coverage that opens Observatory and verifies an active trace,
  a waiting state, a completed trace, and an error/budget signal.
- Validate OTel-shaped export against a real collector before claiming strict
  OTel compliance.
- Surface provider token/cost data only when the provider stream exposes it
  reliably.

## Acceptance gate

- Unit tests cover trace projection for all four providers, including
  permissions, user input, subagents, errors, session end, and Codex app-server
  MCP elicitations.
- E2E fixture run shows an Observatory surface with at least one active trace,
  one waiting permission/input state, one completed trace, and one error or
  blocked state.
- Trace persistence survives app restart in an isolated temp home and does not
  corrupt existing `~/.realmkeeper/state.json` or permission rules.
- Exported trace JSON for fixture data contains stable trace/span hierarchy,
  provider/session/repo attributes, duration fields, and no raw prompt/tool
  content unless the explicit content-capture setting is enabled.
- No provider-specific live path regresses: `bun run typecheck`,
  `bun run test`, and `bun run test:e2e` pass.

## Coverage gaps — what this does NOT validate

- Live provider cost/token metadata is inconsistent. The first pass can only
  surface values providers already emit in stream/hook payloads.
- OTel GenAI conventions are still in development. We should use their
  vocabulary but avoid claiming strict compliance until an export probe
  validates against a real collector.
- This plan does not add cloud dashboards. External systems remain optional
  export targets after local traces prove useful.
- This does not implement provider-native orchestration. Realmkeeper still
  steers through existing spawn/resume/prompt/permission paths.
