# Research — Agent Orchestration Workflows

> Backs the decision. Findings labeled; each maps to a probe; each tagged
> measured / decided / asserted / build-gated.

## Findings

### H1 — Durable agent orchestration centers on explicit state and checkpoints [probe R1 · measured]

LangGraph guidance breaks agents into discrete steps, shared state, and
explicit transitions. Its persistence model separates thread-scoped
checkpoints from longer-lived stores and names conversation continuity,
human-in-the-loop workflows, time travel, and fault tolerance as checkpointer
use cases. Its interrupt model pauses execution, saves state, and resumes with
external input.

Sources:
- <https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph>
- <https://docs.langchain.com/oss/python/langgraph/persistence>
- <https://docs.langchain.com/oss/python/langgraph/interrupts>

### H2 — User-facing agent apps expose run lifecycle, interrupts, state, and steering [probe R2 · measured]

AG-UI frames agent/front-end integration as event streams with run lifecycle
events, state snapshots/deltas, human-in-the-loop interrupts, dynamic
capabilities, cancel/resume, and agent steering. Those concepts map well to
Realmkeeper runs, but AG-UI is a protocol vocabulary, not a reason to rebuild
Realmkeeper around a remote agent backend.

Sources:
- <https://docs.ag-ui.com/introduction>
- <https://docs.ag-ui.com/concepts/events>
- <https://docs.ag-ui.com/concepts/capabilities>
- <https://docs.ag-ui.com/concepts/interrupts>

### H3 — Observability platforms treat traces as the raw material for monitoring and improvement [probe R3 · measured]

Langfuse describes traces as structured records of prompts, responses, token
usage, latency, tools, retrieval steps, inputs, outputs, and cost. OpenAI
Agents traces include workflows, agent runs, model generations, tool calls,
guardrails, handoffs, and custom events. Orchestration runs should therefore
emit traceable checkpoints and decisions instead of acting as an invisible
timer loop.

Sources:
- <https://langfuse.com/docs/observability/overview>
- <https://openai.github.io/openai-agents-python/tracing/>

### H4 — Realmkeeper already has an embryonic workflow: Standing Orders [probe L1 · measured]

Local code shows Standing Orders persist in renderer state, schedule recurring
prompts, stop after configured iterations, and halt after repeated failures.
The implementation is useful but renderer-owned: timers and prompt sends are
tied to app UI runtime instead of a main-process run engine.

Sources:
- `.docs/architecture/state.md`
- `src/renderer/src/standing-orders.ts`
- `src/renderer/src/store.ts`
- `src/shared/schemas/persisted.ts`

### D1 — Main-process local runs before external workflow engines [probe R1/R2/L1 · decided]

The smallest reliable step is a local main-process run engine that composes
Realmkeeper's provider controls and event bus. External workflow engines would
add new operational dependencies before the core session-control and trace
planes are proven.

### D2 — Standing Orders are the first migration target [probe L1 · decided]

Standing Orders already exercise scheduling, repeated sends, stop limits, and
user-visible controls. Migrating them first proves the durable runner with a
known feature instead of inventing an unrelated workflow.

## Probe → finding map

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| R1 — Durable orchestration scan | Which orchestration concepts are worth borrowing? | H1, D1 | Network/docs only |
| R2 — Agent UI protocol scan | Which run/control primitives matter in user-facing agent apps? | H2, D1 | Network/docs only |
| R3 — Observability scan | Why should orchestration emit traceable checkpoints? | H3 | Network/docs only |
| L1 — Standing Orders scan | What workflow behavior exists today and where is it fragile? | H4, D2 | Local repo only |

## Coverage gaps

- No real restart-recovery probe exists yet. The first implementation must
  simulate main-process restart with an isolated temp state directory.
- No provider budget completeness probe exists. Cost/token budgets remain
  optional until the observability plan measures provider payload coverage.
- No UX prototype has been tested for run board density. The implementation
  needs Playwright coverage to ensure controls stay legible and non-overlapping.
- Automated quality evaluation for provider outputs is intentionally out of
  scope; orchestration can collect outputs before it can rank them.
