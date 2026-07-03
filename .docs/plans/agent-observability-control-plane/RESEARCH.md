# Research — Agent Observability Control Plane

> Backs the decision. Findings labeled; each maps to a probe; each tagged
> measured / decided / asserted / build-gated.

## Findings

### H1 — Production agent tools converge on trace/span observability [probe R1 · measured]

LangSmith describes visibility from individual traces to production metrics,
with filtering, exporting, sharing, dashboards, alerts, automations, online
evaluations, and feedback. Langfuse similarly centers application tracing as
structured logs covering prompt, model response, token usage, latency, tools,
retrieval steps, timing, inputs, outputs, and cost. Phoenix frames traces as
runs broken into spans for agents, tasks, and tools, then uses them as the raw
data for evaluation and improvement. OpenAI Agents SDK traces entire workflows,
agent runs, generations, tool calls, guardrails, handoffs, and custom events.

Sources:
- <https://docs.langchain.com/langsmith/observability>
- <https://langfuse.com/docs/observability/overview>
- <https://arize.com/docs/phoenix/get-started/get-started-tracing>
- <https://openai.github.io/openai-agents-python/tracing/>

### H2 — OTel GenAI is the right vocabulary, but not yet a hard contract [probe R2 · measured]

OpenTelemetry moved GenAI semantic conventions into a separate
`semantic-conventions-genai` repository and marks many GenAI spans/events as
development. The conventions still provide useful field names:
`gen_ai.operation.name`, provider, conversation id, model, usage tokens,
response model, duration, tool execution, MCP method/session ids, and error
type. They explicitly warn that full inputs/outputs and tool arguments/results
can contain sensitive information and should be opt-in/redacted.

Sources:
- <https://opentelemetry.io/docs/specs/semconv/gen-ai/>
- <https://github.com/open-telemetry/semantic-conventions-genai>
- <https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-spans.md>
- <https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/mcp.md>

### H3 — Durable orchestration patterns are about explicit state, checkpoints, interrupts, and fault handling [probe R3 · measured]

LangGraph's current guidance breaks agents into discrete nodes, shared state,
and explicit transitions. It distinguishes LLM, data, action, and user-input
steps; recommends storing raw state instead of formatted prompts; and routes
human-fixable errors through interrupts. Its persistence model separates
thread-scoped checkpoints from cross-thread stores and names conversation
continuity, human-in-the-loop workflows, time travel, and fault tolerance as
checkpointer use cases.

Realmkeeper should reuse these ideas as observability concepts, not replace
provider CLIs with a graph runtime.

Sources:
- <https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph>
- <https://docs.langchain.com/oss/python/langgraph/persistence>
- <https://docs.langchain.com/oss/python/langgraph/interrupts>

### H4 — Realmkeeper's current architecture is a strong event spine but not a trace model [probe L1 · measured]

Local code/docs show `AgentEvent` as a flat event envelope with provider,
session id, cwd/repo root, timestamp, kind, payload, and source. The main
`event-bus.ts` stamps repo roots and validates events, then the renderer keeps
`events[]` and derives units/worlds/letters. There is no stable event id,
trace id, span id, parent span id, durable event retention, cost/token summary,
or explicit causal model beyond session id, request id, and some provider
payloads.

Sources:
- `src/shared/schemas/events.ts`
- `src/main/event-bus.ts`
- `src/renderer/src/store.ts`
- `src/renderer/src/store-domain/event-reducer.ts`
- `.docs/architecture/events.md`
- `.docs/architecture/bridge.md`

### D1 — Local-first observability before vendor integration [probe R1/R2/L1 · decided]

Realmkeeper's value is a personal local command room over several existing
coding CLIs. A hosted observability backend would add account/API-key setup
before the local user has a useful trace view. The first implementation should
persist local trace projections, make the UI actionable, and keep exporter
interfaces optional.

### D2 — Trace content capture is opt-in [probe R2 · decided]

Provider prompts, tool arguments, MCP forms, file snippets, and command output
can include secrets or local project data. Store summaries, hashes, sizes,
types, durations, and known cost/token metadata by default. Add raw
input/output capture only behind an explicit setting and make exports redacted
by default.

## Probe → finding map

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| R1 — Observability platforms scan | What do current agent observability tools expose as the core object? | H1 | Network/docs only |
| R2 — OTel GenAI/MCP scan | Which trace fields can Realmkeeper align with without overcommitting? | H2, D2 | Network/docs only |
| R3 — Orchestration docs scan | What orchestration concepts are worth borrowing without replacing provider CLIs? | H3 | Network/docs only |
| L1 — Local architecture scan | What does Realmkeeper already capture, and what is missing for traces? | H4, D1 | Local repo only |

## Coverage gaps

- No real trace exporter probe has been run. Export remains build-gated.
- No cost/token completeness matrix exists for Claude, Codex, Cursor, and
  Gemini. The first implementation must measure which stream payloads include
  usage data.
- No retention-size benchmark exists. JSONL is chosen for low dependency risk,
  but a later probe may justify SQLite if trace queries become slow.
- External vendor integrations are intentionally unvalidated. The plan only
  requires local trace usefulness and redacted export.
