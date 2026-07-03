# Session Control Plane

> **Status:** 📋 Plan
> **Owner:** TBD
> **Drafted:** 2026-07-03 · **Last updated:** 2026-07-03 (implementation progress reconciled)
> **Engineer profile:** Senior TypeScript/Electron engineer — provider adapters, IPC schemas, renderer controls; read `.docs/architecture/ipc.md`, `.docs/architecture/events.md`, `.docs/providers/{claude,codex,cursor,gemini}.md`, `src/main/agent-manager.ts`, `src/main/index.ts`, `src/shared/schemas/ipc.ts`, `src/renderer/src/ui/WielderChatInput.tsx`, and `src/renderer/src/ui/floating/WielderPanelBody.tsx` first
> **Effort:** 4 PRs, medium
> **Scope:** Add provider-aware in-app controls for active and observed sessions · **Origin:** Follow-on from provider parity work and the request for more session control from the app
> **Related:** [`../agent-observability-control-plane/`](../agent-observability-control-plane/), [`../agent-orchestration-workflows/`](../agent-orchestration-workflows/), [`./RESEARCH.md`](./RESEARCH.md), [`../../providers/`](../../providers/), `src/main/agent-manager.ts`, `src/shared/schemas/ipc.ts`, `src/renderer/src/ui/WielderChatInput.tsx`

## TL;DR

Realmkeeper can already spawn, resume/send prompts to observed sessions, and
kill sessions it owns. The next step is to make the app a real session command
room: show exactly which controls each provider/session supports, expose those
controls in the wielder panel and chat drawer, and route every command through
typed IPC with visible success/failure events.

Do this with a capability model, not by pretending Claude, Codex, Cursor, and
Gemini all support the same live-control surface.

## Decision

- ✅ **Use explicit provider/session capabilities.** Each wielder gets a
  derived `SessionCapabilities` record: `canSend`, `canSteer`,
  `canInterrupt`, `canStop`, `canFork`, `canAttach`, `canListProviderSessions`,
  and `permissionAuthority`. The renderer disables unsupported controls with a
  reason instead of hiding mismatches.

- ✅ **Treat Codex app-server as the strongest control baseline.** Codex
  already exposes `thread/start`, `thread/resume`, `thread/fork`,
  `turn/start`, `turn/steer`, and `turn/interrupt`. Realmkeeper should expose
  steer/interject and interrupt first for Codex-owned active turns.

- ✅ **Use Claude resume/fork/background commands carefully.** Claude
  `--resume` continues the same session, `--fork-session` branches it, and
  background commands such as `claude agents --json`, `claude attach`,
  `claude logs`, `claude stop`, and `claude respawn` are promising. Do not
  claim live TUI sync: provider docs already note external resumes can leave a
  running TUI stale until reload.

- ✅ **Keep Cursor observed sessions honest.** Cursor can be driven through
  `cursor-agent --print --resume <chatId>` for known chats, but IDE permission
  control remains observe-only in allowlist mode. The UI should say "resume
  via CLI" or "observe only", not imply direct IDE injection.

- ✅ **Keep Gemini minimal until auth/headless behavior is stable.** Gemini
  supports `--session-id`, `--resume`, and `--list-sessions`, but current
  OAuth/account-tier behavior is uncertain for headless Realmkeeper spawns.
  Expose owned-session send/stop and diagnostic session list first; leave ACP
  as a separate spike.

- ✅ **Every control emits normal events.** User-originated controls should
  emit `user_prompt`, `session_control`, or `error` events with provider
  diagnostics so the observability plan can turn them into trace spans and
  monitor signals.

## PR sequence

1. **Capability registry and schemas** — Add shared `SessionCapabilities` and
   `SessionControlAction` types, plus a pure capability resolver for
   provider/source/status combinations. Cover spawned, hook-observed, and
   Realmkeeper-resumed sessions for all four providers.

2. **Control IPC and adapter shims** — Add `rw:control-session` with strict
   request/response schemas and main-process dispatch. Implement Codex steer,
   interrupt, fork, and stop-owned paths first. Add command builders for
   Claude resume/fork/background-list probes, and keep Cursor/Gemini to safe
   resume/send and stop-owned paths.

3. **Wielder and chat controls** — Replace ad hoc `spawnedHere` gating with
   capability-backed buttons in the wielder panel and chat drawer:
   send/interject, interrupt, fork, recall/stop, attach/open-native, and
   provider-session diagnostics where supported. Controls must show provider
   limits in tooltips.

4. **Failure states and e2e fixtures** — Add fixture scenarios for supported,
   unsupported, stale, and provider-error control attempts. Verify disabled
   states, visible errors, and event emission. Add live-provider probes only
   for behavior not already covered by existing provider docs/probes.

## Implementation progress

Shipped on `main`:

- Shared provider/session capability resolver with provider-specific control
  availability and reasons.
- Typed `rw:control-session` IPC with explicit failure reason codes.
- Wielder panel controls use capabilities for decree, interrupt, and recall
  states; unsupported controls stay disabled with explanatory tooltips.
- Realmkeeper-originated controls emit normal `session_control` events, and
  observability projects them into trace spans.
- Orchestration uses the same session-control plane for Standing Orders and
  pauses durable runs on explicit control-plane failures.

Still active:

- Wire additional provider-native controls that remain intentionally marked
  "not wired": Codex fork/attach/list sessions, Claude background agent
  discovery/attach/stop probes, Cursor authoritative attach/injection, and
  Gemini ACP/live interrupt.
- Add e2e fixtures for supported, unsupported, stale, and provider-error
  control attempts in the packaged app path.
- Keep Cursor permission/control behavior observe-only unless provider docs or
  probes prove an authoritative control path.

## Acceptance gate

- Capability resolver unit tests cover all providers, session sources, and
  active/inactive turn states.
- IPC schema rejects unsupported actions before adapters run, and adapters
  still fail closed if provider state changes after the UI renders.
- Codex fixture or mocked app-server test proves active-turn steer/interject,
  interrupt, fork, and stop-owned behavior.
- Claude command-builder tests cover resume, fork, background list, attach,
  logs, stop, and unsupported live-control fallbacks.
- Renderer tests prove unsupported controls are disabled with reasons and
  supported controls call `rw:control-session` with the right payload.
- `bun run typecheck`, `bun run test`, and the relevant e2e fixture pass.

## Coverage gaps — what this does NOT validate

- Claude background/remote-control commands still need focused live probes
  before Realmkeeper treats them as reliable controls.
- Cursor IDE sessions remain observe-only unless Cursor exposes an
  authoritative attach/injection API or a stronger permission contract.
- Gemini ACP is not part of this plan. It is only worth pursuing after the
  simpler prompt/resume/list path proves insufficient.
- Provider-native stop semantics differ. The UI must describe whether it is
  stopping a Realmkeeper-owned process, asking a provider to stop, or only
  marking a local control attempt as failed.
