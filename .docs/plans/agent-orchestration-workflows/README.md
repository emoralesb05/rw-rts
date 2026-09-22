# Agent Orchestration Workflows

> **Status:** 🚧 Core shipped; hardening remains — durable local runs are delivered, but monitor-driven pauses and verified workflow outcomes are not.
> **Owner:** TBD
> **Drafted:** 2026-07-03 · **Last updated:** 2026-09-22 (working-tree manual verification safety gate; historical research not refreshed)
> **Engineer profile:** Senior TypeScript/Electron engineer — local schedulers, persisted state, provider control APIs; read `.docs/architecture/state.md`, `.docs/architecture/events.md`, `.docs/architecture/ipc.md`, `src/renderer/src/standing-orders.ts`, `src/renderer/src/store.ts`, `src/shared/schemas/persisted.ts`, `src/main/persistent-state.ts`, `src/main/agent-manager.ts`, and `.docs/plans/session-control-plane/` first
> **Effort:** 5 PRs, large
> **Scope:** Add durable local orchestration runs that coordinate provider sessions through checkpoints, budgets, and human intervention · **Origin:** Follow-on from observability/session-control planning
> **Related:** [`../session-control-plane/`](../session-control-plane/), [`../agent-observability-control-plane/`](../agent-observability-control-plane/), [`./RESEARCH.md`](./RESEARCH.md), [`../../architecture/state.md`](../../architecture/state.md), `src/renderer/src/standing-orders.ts`, `src/main/agent-manager.ts`

## TL;DR

Realmkeeper coordinates provider-native workers, not a replacement agent
runtime. Durable local runs send prompts, record checkpoints, and pause for
human decisions or supported budget/error conditions. Standing Orders now run
in main; stronger outcome and monitor-pause contracts remain below.

## Decision

- ✅ **Use provider CLIs as workers, not nodes in a replacement runtime.**
  LangGraph-style state/checkpoint/interrupt concepts are useful, but
  Realmkeeper's product is a command room over provider-native sessions.

- ✅ **Model a durable run explicitly.** Add `OrchestrationRun`,
  `OrchestrationStep`, `Checkpoint`, and `RunBudget` records. Each run links
  to provider sessions, trace ids, permission/input request ids, and the last
  successful checkpoint.

- ✅ **Move orchestration execution to main.** The renderer can create and
  monitor runs, but the main process should own timers, retries, prompt sends,
  and stop decisions so a panel refresh or React remount does not duplicate
  work.

- ✅ **Compose the session-control plane.** Runs should call the same
  `rw:control-session` actions used by manual UI controls. No private adapter
  shortcut should bypass capability checks, permission gates, or event
  emission.

- ✅ **Interrupt before guessing.** Any ambiguous branch, dangerous action,
  provider error, repeated failure, missing capability, or budget breach should
  pause the run and ask the user instead of silently continuing.

- ✅ **Start with constrained workflows.** First-class run templates:
  recurring prompt/Standing Order, provider handoff review, parallel provider
  comparison, and "fix then test" loop. Do not add open-ended autonomous
  project management until budgets, traces, and stop controls are proven.

## PR sequence

1. **Run schema and event contract** — Add shared run schemas for
   `OrchestrationRun`, steps, checkpoints, budgets, and run events. Persist run
   state separately from renderer UI state, with migrations and tests.

2. **Main-process run engine** — Move Standing Order execution into main as
   the first run type. The engine schedules ticks, calls session-control
   actions, records checkpoints, emits run events, and pauses on missing
   capabilities or provider errors.

3. **Run board UI** — Add a compact workflow surface that lists active,
   paused, completed, and failed runs. Each row links to wielders, traces, open
   permissions/input letters, and manual controls. Include pause, resume, stop,
   and inspect actions.

4. **Templates and handoffs** — Add constrained templates for recurring
   prompt, parallel provider comparison, and provider handoff. Each template
   must declare required capabilities, budgets, stop rules, and the prompt
   payloads it will send.

5. **Monitoring and recovery hardening** — Integrate observability monitors:
   stuck waiting, repeated tool loops, error streaks, slow tools, and budget
   thresholds pause or stop runs. Add restart recovery so pending runs resume
   only when their checkpoint and provider capability state are still valid.

## Implementation progress

Shipped on `main`:

- Durable `OrchestrationRun` schemas, local `runs.json` store, migrations,
  lifecycle transitions, checkpoints, and restart recovery.
- Main-process Standing Order engine that schedules ticks, uses
  `rw:control-session`, records steps/checkpoints, completes at iteration
  budget, fails retryable send streaks, pauses malformed runs, pauses explicit
  control-plane failures, and pauses runtime budget breaches.
- Run Board UI with list, refresh, pause, resume, stop, and durable run state
  shared across the HUD and wielder detail panel.
- Standing Order creation routes through the durable main orchestration engine.
  The old renderer timer runner is retired; hydrated legacy persisted
  `standingOrders` migrate into durable runs once their matching wielder
  reappears, then halt so they drop from persisted state.
- Orchestration run events emit onto the normal AgentEvent bus and project into
  Observatory/trace export spans.
- Shared constrained template registry declares Standing Order, provider
  handoff review, parallel provider comparison, and fix-then-test budgets,
  controls, stop rules, and prompt payload names.
- Run Board can create queued draft runs for provider handoff review, parallel
  provider comparison, and fix-then-test templates using selected
  send-capable provider sessions, editable prompt fields, verification command
  input, shared default budgets, and disabled states when required inputs are
  missing.
- Main-process engine executes provider handoff review, parallel provider
  comparison, and fix-then-test templates as checkpointed one-shot sends
  through `rw:control-session`, with captured outputs and provider error pauses.
  Handoff/comparison completion means response capture, not verified task success.
- Post-release working tree: fix-then-test pauses after a response/end for manual
  verification. Resume/restart cannot certify success or resend that prompt.
  Automatic verification loops and source-trace handoff guards remain unbuilt.
- Run Board rows link to related provider sessions, provider traces, and
  pending permission/input letters when the run record or draft params carry
  enough target metadata.
- Electron e2e covers Run Board durable controls, target-backed queued
  template creation, recurring Standing Order completion, provider error
  pause, permission/input pause, and runtime budget pause in the packaged app
  path.

Remaining: proposed slow-tool/stuck/repeated-loop monitor pauses are not wired
into the engine. One-shot templates collect responses, not verified successful
outcomes: fix-then-test sends a composed prompt rather than running a validated
test loop; handoff does not validate unresolved requests on the source trace.
See the [release audit](../RELEASE-0.9.0-AUDIT.md). Automated judging, cost budgets,
and external engines remain deferred, not required parity work.

## Acceptance gate

- Run schema and persistence tests cover create, update, pause, resume, stop,
  complete, fail, migration, and restart recovery.
- Standing Orders run from main, survive renderer remount, and retain the
  current max-iteration/failure-stop behavior.
- Run engine tests prove capability checks happen before provider actions and
  unsupported actions pause with a visible reason.
- Fix/test response/end, resume, and restart cannot mark the run completed or
  resend; captured output remains available and the UI explains unverified status.
- UI tests cover run board states, links to wielders/traces/letters, and
  pause/resume/stop actions.
- Fixture e2e covers at least one recurring prompt run, one provider error
  pause, one permission/input pause, and one completed run.
- `bun run typecheck`, `bun run test`, and the relevant e2e fixture pass.

## Coverage gaps — what this does NOT validate

- This plan does not add a LangGraph, Temporal, or cloud workflow dependency.
  A later plan can revisit that if local run complexity justifies it.
- Provider cost ceilings are not reliable across all CLIs. Budgets should
  start with local iteration/time/error limits and use token/cost values only
  when observability can prove they are present.
- Cross-provider result judging is not included. Parallel comparison can
  collect outputs, but automated ranking needs a separate eval/quality plan.
- Runs cannot guarantee recovery of a provider-native session that exited,
  lost auth, or changed its transcript format. Recovery pauses with a reason.
