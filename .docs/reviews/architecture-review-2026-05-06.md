# Architecture Review - 2026-05-06

Point-in-time review of the current codebase after the Gemini provider work. Scope: `src/main`, `src/preload`, `src/renderer`, `src/shared`, package dependencies, and the existing `.docs/architecture` and `.docs/plans` material.

This is not a security audit. It is a backlog-quality architecture pass: what looks solid, what is drifting, what should be fixed soon, and which external libraries are worth adopting or evaluating.

Follow-up work from this review has been completed and the stabilization plan
was removed after landing the Vitest/Zod/Radix/React Testing Library adoption
work, CSS/design-system migration, provider tests, and renderer store reducer
extraction.

## Current Shape

- Electron main owns side effects: provider CLI processes, hook installation, hook socket bridge, transcript polling, filesystem-backed settings, persistent state, file opening, and IPC handlers.
- The preload exposes a narrow `window.kh` API. Main wraps IPC handlers with a sender-frame guard so only the app's top-level renderer frame can call privileged handlers.
- Renderer state is centralized in `src/renderer/src/store.ts` via Zustand. The UI derives units, worlds, letters, orders, and persistent stats from `AgentEvent`s.
- Provider integrations have two paths:
  - spawned sessions started by Keykeeper through `AgentManager`
  - observed sessions flowing through provider hooks into `hook-bridge.ts`
- Claude and Codex still need transcript polling for assistant text. Cursor and Gemini use response hooks directly.

## What Is Working

- The provider model is converging on a useful contract: every adapter implements `{ unitId, sessionId, cwd, send, kill }`, and every observed/spawned activity becomes an `AgentEvent`.
- The bridge is the right choke point for provider normalization. Keeping raw provider quirks out of the renderer is the correct boundary.
- `repoRoot` stamping is the right identity primitive. It lets the same provider in the same repo stay stable across subdirectory cwd changes.
- Persistence is intentionally small. It saves durable gameplay/application state without trying to own provider transcript history.
- The Electron IPC surface is already treated as privileged, with `safeHandle()` guarding against unexpected frames.

## Fix Soon

1. Seal stats should use repo-root identity.

   `sealKeyhole()` currently bumps per-wielder seals with `unitIdentityFor(unit.tool, unit.cwd)`. Visits and standing orders use `unit.repoRoot ?? unit.cwd`. If a session runs from a repo subdirectory, seal counts can miss the persisted wielder record. Use `unit.repoRoot ?? unit.cwd` there.

2. Stop transcript watchers from shared quit cleanup.

   `will-quit` stops spawned agents, the hook bridge, fixtures, and persistence flushing. The Claude/Codex transcript watchers are only explicitly stopped on the non-mac `window-all-closed` path. The process exits, so this is low risk, but shared cleanup would match the architecture and simplify tests/relaunches.

3. Document or gate Cursor spawned trust mode.

   Spawned Cursor sessions use `cursor-agent` with `--force --trust`. That may be intentional for Keykeeper-controlled sessions, but it is different from observed Cursor sessions where Keykeeper is awareness-only and Cursor's native UI decides. Make the behavior explicit in provider docs, and consider a setting before broad distribution.

4. Treat prompt-in-argv as a privacy risk.

   Claude, Cursor, Codex, and Gemini spawn adapters pass prompts as command arguments. This is normal for many CLIs, but it can expose prompts through process listings while the process is alive. Research whether each provider supports stdin or another safer input mode before changing it.

5. Keep adding tests before large refactors.

   The repo now has a Vitest harness and first coverage for schema validation, provider stream normalization, transcript parsing, hook payload normalization, settings exclusions, notification settings, activity summaries, role archetypes, and unit identity. The next tests should cover store reducers, standing-order persistence/rebinding, permission-letter actions, and provider installer idempotency.

## Structural Opportunities

- Split `src/renderer/src/store.ts` into pure domain reducers plus a thin Zustand shell. This makes permissions, orders, unit derivation, and persistence easy to test without React/Electron.
- Split `src/main/adapters/hook-bridge.ts` into transport, pending-permission routing, normalizers, and provider-specific helpers. The bridge is the right boundary, but one file now owns too many reasons to change.
- Split `src/renderer/src/game/scenes/Kingdom.ts` into scene orchestration plus systems for worlds, units, particles/effects, camera, and hit testing.
- Break `src/renderer/src/ui/ConversationStream.tsx` into renderers by event family: messages, tools, permissions, session lifecycle, and markdown body.
- Reduce `src/renderer/src/styles.css` by moving repeated controls to owned React primitives and using Tailwind v4 theme tokens for shared values.

Largest files at review time:

| File | Lines | Note |
|---|---:|---|
| `src/renderer/src/styles.css` | 3597 | Design system extraction target |
| `src/renderer/src/game/scenes/Kingdom.ts` | 1720 | Scene/system split target |
| `src/renderer/src/store.ts` | 1485 | Reducer/testability target |
| `src/renderer/src/ui/ConversationStream.tsx` | 993 | Renderer split target |
| `src/main/adapters/hook-bridge.ts` | 765 | Provider normalizer split target |

## Security And Robustness Notes

- Keep following Electron's local-content model. Electron documents that Electron apps have broader filesystem/shell power than browsers, and recommends current Electron versions, context isolation, sandboxing, CSP, sender validation, and not exposing Electron APIs to untrusted web content.
- `safeHandle()` protects against injected iframes, but top-frame renderer compromise can still call `window.kh`. That makes markdown rendering, link handling, and runtime IPC validation important.
- Add runtime validation at process boundaries. TypeScript types do not validate provider hook JSON, renderer IPC payloads, persisted state files, or settings files at runtime.
- Treat provider output as untrusted text. Keep raw HTML disabled or sanitized in rendered markdown, restrict external link behavior, and avoid adding broad preload APIs.
- Permission decisions should remain fail-closed where providers support synchronous blocking. Gemini's managed policy and `BeforeTool` hook are a good example of explicitly pairing observability with enforcement.

## Technology Radar

| Technology | Recommendation | Why |
|---|---|---|
| Radix UI primitives | Adopt for dialogs, tabs, tooltips, select/dropdowns, popovers, and scroll areas | Gives accessible behavior while keeping visual ownership in our components. Matches the design-system direction that has since landed. |
| Tailwind v4 theme variables | Adopt incrementally | Tailwind v4 exposes theme values as CSS variables, which fits the current CSS-heavy renderer and can reduce repeated magic values. |
| Zod | Adopt at IPC/provider/persistence boundaries | Small, direct runtime schema validation for untrusted JSON and renderer calls. |
| Vitest | Adopt | Fast unit tests for pure TypeScript reducers, normalizers, and parser helpers. |
| React Testing Library | Adopt | Useful for focused renderer component behavior without snapshot-heavy UI tests. |
| Playwright Electron | Adopt for smoke tests | Direct Electron launch/control is useful for provider settings, app boot, and permission letter flows. |
| Zustand middleware (`subscribeWithSelector`, `immer`, maybe `persist`) | Evaluate | `subscribeWithSelector` can reduce broad subscriptions; `immer` can simplify nested reducer updates. Keep main-owned persistence for durable app state unless there is a clear reason to move it. |
| Execa | Evaluate narrowly | Good for version probes and short commands. Native `spawn` is still reasonable for long-lived provider streams until we prove Execa improves cancellation/stream handling. |
| Chokidar | Evaluate only if transcript polling hurts | Could replace polling, but provider JSONL append patterns and cross-platform behavior need measurement. Polling is simple and currently good enough. |
| TanStack Virtual | Defer | Useful if the chat/activity lists grow beyond the current event cap. Not urgent while the store caps event history. |
| XState or another state-machine library | Defer | Provider lifecycle can probably be cleaned up first with a typed adapter interface and reducer tests. Add a state-machine library only if lifecycle complexity keeps growing. |

## Suggested Sequence

1. Fix the small correctness items: seal identity, watcher cleanup, stale standing-order comments, and Cursor trust-mode docs.
2. Continue expanding the Vitest suite around store reducers, permission-letter actions, and provider installer idempotency.
3. Extract pure store reducers and bridge normalizers with tests locked around current behavior.
4. Continue the planned design-system work with Radix primitives and Tailwind theme tokens.
5. Research prompt input modes and multi-choice permission flows per provider before changing those contracts.
6. Add Playwright Electron smoke coverage once the core flows have stable selectors and test fixtures.

## Source Links

- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Electron context isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- Playwright Electron API: https://playwright.dev/docs/api/class-electron
- Vitest guide: https://vitest.dev/guide/
- React Testing Library intro: https://testing-library.com/docs/react-testing-library/intro/
- Radix Dialog primitive: https://www.radix-ui.com/primitives/docs/components/dialog
- Tailwind theme variables: https://tailwindcss.com/docs/theme
- Zustand `subscribeWithSelector`: https://zustand.docs.pmnd.rs/reference/middlewares/subscribe-with-selector
- Zustand Immer middleware: https://zustand.docs.pmnd.rs/reference/integrations/immer-middleware
- Zustand persist middleware: https://zustand.docs.pmnd.rs/reference/middlewares/persist
- Zod docs: https://zod.dev/
- Execa: https://github.com/sindresorhus/execa
- Chokidar: https://github.com/paulmillr/chokidar
- TanStack Virtual: https://tanstack.com/virtual/latest/docs/introduction
