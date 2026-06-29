# Plan: Codex app-server hardening

> **Status:** 📋 Plan
> **Owner:** Realmkeeper
> **Drafted:** 2026-06-26 · **Last updated:** 2026-06-28 (implemented app-server diagnostics payloads)
> **Engineer profile:** Senior TypeScript engineer comfortable with JSON-RPC protocols; read `.docs/providers/codex.md`, `src/main/adapters/codex-app-server.ts`, `src/main/adapters/codex-cli.ts`, and `src/main/adapters/cli-streams.test.ts` first
> **Effort:** 3 PRs, medium
> **Scope:** Codex app-server approvals, user input, steering, and unsupported request handling · **Origin:** provider CLI hardening
> **Related:** [provider parity](../provider-cli-hardening/), [Claude](../claude-cli-hardening/), [Cursor](../cursor-agent-hardening/), [Gemini](../gemini-cli-hardening/)

## TL;DR

Codex is the richest integration surface and should stay on `codex app-server --stdio`. Parity work is mostly hardening: every known request shape either maps to a Realmkeeper letter/permission action or fails closed with a tested diagnostic.

## Implemented Baseline

- `codex app-server --stdio` starts new Codex sessions from Realmkeeper.
- `thread/resume` plus `turn/start` drives observed sessions from Realmkeeper.
- Active Realmkeeper-spawned sessions use `turn/steer` when there is an in-flight turn.
- App-server notifications normalize into Realmkeeper events.

## Decision

- ✅ Keep app-server as the only normal Realmkeeper Codex drive path. Legacy `exec resume` remains for fixture/transcript compatibility, not new feature work.
- ✅ Treat command, file-change, permissions-profile, legacy exec, and legacy patch approvals as actionable permission cards.
- ✅ Treat `item/tool/requestUserInput` and typed MCP elicitation `form` mode as answer letters.
- ✅ Fail closed for MCP URL mode, `openai/form` mode, and dynamic app-server tools until Realmkeeper has first-class UI for those request shapes.
- ✅ Keep `turn/steer` as Codex's provider-specific advantage. Other providers do not need artificial mid-turn parity.

## PR sequence

1. **Request-shape regression suite** — assert every app-server request method maps to permission, answer letter, or explicit fail-closed response.
2. **Codex diagnostics** — ✅ implemented: app-server lifecycle/prompt/error events carry `payload.codexAppServer` with startup/turn status, current thread/turn ids, approval category mapping, and unsupported request counts.
3. **Dynamic-tool decision gate** — keep dynamic tools disabled by default; open a separate feature plan only when there is a concrete Realmkeeper-local tool use case.

## Acceptance gate

- Tests cover `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, legacy exec/patch approval, `item/tool/requestUserInput`, typed MCP form elicitation, and unsupported request shapes.
- Unsupported request shapes fail closed with a visible letter or logged diagnostic that includes unsupported request counts; none hang the turn silently.
- Codex `turn/steer` is covered for active in-flight turns and normal `turn/start` is covered for idle/resumed turns.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` pass.

## Probes

- Protocol probe: [probes/codex-app-server-2026-06-25.md](probes/codex-app-server-2026-06-25.md)
- CLI/docs snapshot: [provider CLI capability snapshot](../provider-cli-hardening/probes/provider-cli-capability-2026-06-26.md)
- Live approval round trip: [probes/codex-app-server-live-probe-2026-06-26.md](probes/codex-app-server-live-probe-2026-06-26.md)

## Coverage gaps — what this does NOT validate

- No product decision exists for Codex dynamic tools, so this plan deliberately keeps them disabled/fail-closed.
- MCP URL and `openai/form` rendering need a separate UI design before they can be treated as parity features.
- App-server protocol drift still requires rerunning the dated probes after Codex upgrades.
