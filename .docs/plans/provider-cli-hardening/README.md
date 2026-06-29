# Plan: Provider CLI hardening

> **Status:** 📋 Plan
> **Owner:** Realmkeeper
> **Drafted:** 2026-06-26 · **Last updated:** 2026-06-29 (implemented Claude AskUserQuestion letters)
> **Engineer profile:** Senior TypeScript/Electron engineer with CLI protocol experience; read `.docs/providers/`, `src/main/adapters/`, `src/main/*hook-installer.ts`, and `src/main/adapters/cli-streams.test.ts` first
> **Effort:** 5 PRs, medium; one shared contract PR plus one provider PR each
> **Scope:** normalize provider launch, resume, stream, permission, docs, and probe contracts · **Origin:** follow-on from provider CLI capability research
> **Related:** [Claude](../claude-cli-hardening/), [Codex](../codex-app-server-hardening/), [Cursor](../cursor-agent-hardening/), [Gemini](../gemini-cli-hardening/), [multi-choice permissions](../multi-choice-permissions.md)

## TL;DR

Provider parity is possible as a contract, not as identical mechanics. Claude, Codex, and Gemini can provide actionable approval through hooks or app-server requests; Cursor remains observe-first until the CLI exposes a supported external approval contract.

The parity plan is to make every provider explicit about five things: how Realmkeeper starts it, how Realmkeeper resumes or interjects, how events become UI activity, how permissions are enforced or marked observe-only, and which probe proves the contract after a CLI upgrade.

## Current version snapshot

| Provider | Installed CLI | Primary active path | Resume/interject path | Permission path |
|---|---:|---|---|---|
| Claude | `2.1.195` | `claude -p --output-format stream-json --verbose` | `--resume` | hook bridge, actionable |
| Codex | `0.142.2` | `codex app-server --stdio` | `thread/resume`, `turn/start`, `turn/steer` | app-server approval requests, actionable |
| Cursor | `2026.06.24-00-45-58-9f61de7` | `cursor-agent --print --output-format stream-json` | `--resume` | native UI observed |
| Gemini | `0.47.0` | `gemini --prompt --output-format stream-json` | `--resume` | hook bridge, actionable |

## Parity contract

| Capability | Claude | Codex | Cursor | Gemini | Ticket rule |
|---|---|---|---|---|---|
| CLI/version probe | provider snapshot + rich stream fixture | provider snapshot + app-server protocol probe | provider snapshot; active/resume fixture still needed | provider snapshot + policy dry run | Every provider keeps a dated probe or explicitly records the missing credential/input. |
| Active start | print-mode stream JSON | app-server `thread/start` + `turn/start` | `create-chat` + print-mode stream JSON | stream-json with explicit `--session-id` | Launch args are built by testable pure functions. |
| Resume / follow-up | `--resume` as a new turn | `thread/resume`, `turn/start`, `turn/steer` | `--resume <chatId>` as a new invocation | `--resume <sessionId>` | Mid-turn steering is Codex-only; other providers get resumed/follow-up turns. |
| Assistant text | stream JSON for Realmkeeper-started turns; transcript watcher for observed gaps | app-server notifications plus transcript fallback formats | stream JSON and `afterAgentResponse` when hooks fire | stream JSON and `AfterAgent.prompt_response` | Renderer sees one canonical `assistant_text` event per final answer segment. |
| Tool/result events | stream and hooks | app-server requests/events | stream JSON; hooks sparse in print resume | stream and hooks | Fixtures cover shell, edit, and read-like events where the provider exposes them. |
| Permissions | actionable `PermissionRequest`, with native prompt race documented | actionable app-server and legacy approval requests | observe-only for native allowlist mode; Realmkeeper-owned `--force` sessions need visible setting | actionable fail-closed `BeforeTool` + managed policy | If external enforcement is unavailable, the UI must say observe-only and never imply allow/deny authority. |
| Structured user input | `PreToolUse` / `AskUserQuestion` letters returning `updatedInput`; live deferred-resume fixture still needed | `item/tool/requestUserInput` and typed MCP form mode | no known external contract | no known external contract | Render answer letters where request schemas exist; fail closed otherwise. |
| Provider docs | `.docs/providers/claude.md` | `.docs/providers/codex.md` | `.docs/providers/cursor.md` | `.docs/providers/gemini.md` | Docs update in the same PR as probe/test changes. |

## Decision

- Codex should stay on app-server as the default drive path. Official docs describe app-server as the rich-client protocol for authentication, conversation history, approvals, and streamed events; it also supports `thread/start`, `thread/resume`, `turn/start`, `turn/steer`, approval requests, structured `item/tool/requestUserInput`, and MCP elicitation form requests.
- Claude should stay on print-mode stream JSON for now. `--include-hook-events` and `--include-partial-messages` are probe-safe but remain off by default because the rich-stream fixture shows metadata events that need explicit transient rendering before they should affect the conversation UI.
- Gemini should use policy-engine aware launches. The current CLI supports project `.gemini/settings.json`, MCP allow/exclude controls, sandboxing, checkpointing, telemetry, shell-output summarization, and `--policy` / `--admin-policy`; local help now marks `--allowed-tools` as deprecated in favor of the policy engine. Public policy docs warn workspace `.gemini/policies` are currently disabled, so Realmkeeper should rely on user/admin policy paths or its own local rule engine.
- Cursor remains observation-first until the CLI exposes an actionable permission contract equivalent to Claude/Gemini hooks or Codex app-server requests.
- Provider launch arg builders should expose newly discovered flags as tested options before runtime defaults change. Claude partial/hook flags and Cursor auto-review/sandbox flags are covered this way; Gemini falls back from `yolo` to `default` when the fail-closed Realmkeeper gate is not installed or hooks are globally disabled.
- Dynamic tools and unknown form surfaces fail closed until Realmkeeper has first-class UI for their schema. This applies today to Codex dynamic app-server tools, Codex MCP URL/openai-form modes, and any future provider-specific structured request that is not represented by a letter action.

## Provider Plans

- [Codex app-server hardening](../codex-app-server-hardening/)
- [Claude CLI hardening](../claude-cli-hardening/)
- [Gemini CLI hardening](../gemini-cli-hardening/)
- [Cursor agent hardening](../cursor-agent-hardening/)

## PR sequence

1. **Shared provider contract** — keep this matrix and `.docs/providers/` aligned; add a small checklist to provider docs for future upgrades.
2. **Codex request parity** — ✅ implemented: app-server approval, user-input, typed MCP form, and unsupported request shapes are covered and surfaced through diagnostics.
3. **Claude stream parity** — ✅ implemented for partial-rendering decision, diagnostics, and synthetic `AskUserQuestion`/`updatedInput` letter fixtures; live deferred-resume capture remains blocked on authenticated provider execution.
4. **Cursor reliability parity** — autonomy disclosure and observe-only permission semantics are implemented; active/resume stream fixtures still need an authenticated live Cursor run.
5. **Gemini policy parity** — ✅ implemented for hook payload fixtures, hook/policy diagnostics, settings export, and `yolo` gating; live policy execution remains blocked on non-interactive Gemini auth.

## Acceptance gate

- `src/main/adapters/cli-streams.test.ts` covers launch args and stream normalization for all four providers.
- Hook/app-server tests cover every actionable permission request and every intentionally observe-only or fail-closed branch.
- Each provider plan links a dated probe, an open coverage gap, and the provider doc section it updates.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` pass.
- Electron smoke verifies the Wielders, Alerts, Activity, and Letters regions render with no console/page errors after provider fixture playback.

## Probes

- [2026-06-26 provider CLI capability snapshot](probes/provider-cli-capability-2026-06-26.md)

## Coverage gaps — what this does NOT validate

- Cursor actionable approvals are upstream-gated; Realmkeeper cannot truthfully claim allow/deny parity for observed Cursor sessions today.
- Live Claude deferred user-interaction and background-agent metadata still need fixture coverage. A 2026-06-29 authenticated print-mode attempt with `--tools AskUserQuestion` initialized with `tools: []`, so the next probe needs a provider-supported trigger for that tool.
- Live Gemini policy execution could not be fully exercised. A 2026-06-29 session-list check reached local auth but failed with `IneligibleTierError` / `UNSUPPORTED_CLIENT`; the current finding remains a static dry-run plus launch-gate tests until a supported non-interactive auth path is available.
- Provider CLIs are fast-moving; this plan is ready to ticket from the 2026-06-26 probes, not a guarantee that future versions still match.

## References

- Codex app-server docs: https://developers.openai.com/codex/app-server
- Claude CLI reference: https://code.claude.com/docs/en/cli-reference
- Claude hooks reference: https://code.claude.com/docs/en/hooks
- Gemini CLI configuration: https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/configuration.md
