# Plan: Architecture stabilization and OSS adoption

**Status**: in progress · **Owner**: TBD · **Phase**: Post-Gemini stabilization

## Goal

Turn the architecture review in [`../reviews/architecture-review-2026-05-06.md`](../reviews/architecture-review-2026-05-06.md) into implementation work:

- fix the small correctness and documentation gaps immediately
- adopt a focused test/runtime-validation stack before broad refactors
- use mature OSS where it removes hand-rolled behavior
- defer libraries that would add architecture weight without paying for themselves yet

## Already actioned from the review

- Seal stats now use the same repo-root identity as visits and standing orders.
- Claude/Codex transcript watchers are stopped from shared runtime cleanup.
- Standing-order runner comments now match persisted order behavior.
- Cursor provider docs now call out Keykeeper-spawned `--force --trust` sessions.
- Vitest is installed with a first focused unit-identity regression test.
- Zod is installed and now validates main-process IPC requests plus settings/persisted state loaded from disk.
- Agent events are now validated at the event bus envelope, and settings exclusion matching has unit coverage.
- Shared schemas are split by domain under `src/shared/schemas/`, with inferred TypeScript types exported from the schemas.
- Hook socket payloads, provider stream JSONL, transcript parser inputs, provider installer JSON config, and renderer-local storage shapes now have schema coverage.
- Pure renderer logic now has unit coverage for activity summaries and wielder archetype classification.
- Store standing-order and permission-letter helpers are extracted into `store-domain.ts` with unit coverage.
- Store letter-action shell behavior now has tests for permission allow/deny, observation-only acknowledgements, dispatch selection, and recalls.
- Provider hook installers now have idempotency tests against mocked home-directory config files.
- Hook bridge normalization and duplicate suppression are split into pure modules with direct imports and focused tests.
- The Radix/Tailwind owned component foundation has landed; remaining UI cleanup is tracked in [`design-system-css-migration.md`](./design-system-css-migration.md).
- The completed `design-system.md` plan was removed; active UI cleanup now lives in the CSS migration plan.
- The first CSS migration slice moved HUD/chrome styling for `HudWidget`, `ActivityLog`, `KingdomHeader`, `CloseAllChip`, `PartyRow`, `LetterCard`, and HUD empty/action states into owned components/Tailwind, reducing `styles.css` from ~3519 to 2547 lines.
- The second CSS migration slice moved floating panel, settings, dispatch, kingdom, wielder detail, and shared tool/archetype/renown chip styling into owned React components, reducing `styles.css` to 1569 lines.
- The third CSS migration slice moved the chat drawer, conversation stream, per-wielder chat input, and legacy unit inspector styling into owned React components/Tailwind, reducing `styles.css` to 526 lines.

## Adopt now

### Vitest

Use for pure TypeScript tests around provider normalization, store domain logic, transcript parsers, and installer idempotency.

First slice:

1. Add `vitest` and a `test` script. **Done.**
2. Extract bridge normalizer helpers into importable modules with no socket side effects. **Done via `hook-normalizer.ts`; no bridge re-export.**
3. Add fixtures for Claude, Codex, Cursor, and Gemini hook payloads. **Started with Claude shell, Gemini `BeforeTool`, and Cursor assistant response fixtures.**
4. Test dedupe keys, permission request mapping, Gemini `BeforeTool`, and transcript assistant text parsing. **Done for dedupe keys, permission mapping, Gemini `BeforeTool`, and transcript parsers.**

Acceptance:

- `bun run test` passes locally.
- At least one provider-normalizer test catches a real mapping regression.
- No Electron window is required for the pure test suite.

### Zod

Use for runtime validation at process boundaries:

- IPC requests from renderer to main
- provider hook payloads entering `hook-bridge.ts`
- settings and persisted state loaded from disk

First slice:

1. Add schemas for `SpawnAgentRequest`, `SendPromptRequest`, `ResolvePermissionRequest`, `AppSettings`, and `PersistedState`. **Done.**
2. Replace direct casts in IPC handlers with `parse`/`safeParse`. **Done for main IPC handlers.**
3. Add provider-specific hook payload schemas only for fields Keykeeper actually reads; keep raw payloads as unknown for logging/debug. **Started with loose hook envelopes, provider stream handshakes, transcript, installer config, and renderer storage schemas.**

Acceptance:

- Invalid IPC payloads fail with clear errors before touching side effects.
- Corrupt settings/persisted files degrade through the existing fallback path.

### Radix UI primitives

The owned Radix/Tailwind foundation has landed. New UI should keep using
the owned wrappers under `src/renderer/src/components/primitives/` and
chrome atoms under `src/renderer/src/components/chrome/`; remaining CSS
reduction is tracked in [`design-system-css-migration.md`](./design-system-css-migration.md).

First slice:

1. Install dialog, tabs, tooltip, select, popover, dropdown menu, and scroll area primitives. **Done.**
2. Add owned wrappers under `src/renderer/src/components/primitives/`. **Done.**
3. Convert `DecreeModal` first because focus trapping and modal semantics matter there. **Done.**

Acceptance:

- Modal focus trap, escape handling, and portal behavior come from Radix.
- Visual styling remains owned by Keykeeper.

### React Testing Library

Use for focused renderer component behavior after Vitest is in place.

First slice:

1. Configure a jsdom Vitest environment for renderer tests.
2. Test `LetterCard` action rendering and `ConversationStream` event grouping.
3. Avoid large visual snapshots; prefer user-visible behavior assertions.

Acceptance:

- Tests exercise the same actions users click, not implementation details.

## Evaluate with a spike

### Playwright Electron

Use for app-level smoke tests once stable selectors exist. This is heavier than Vitest and should not block the first unit-test pass.

Candidate flows:

- app boots and the renderer receives fixtures
- provider settings/status panels render
- permission letter allow/deny path works with a fixture
- Electron navigation/window-open guard blocks external renderer navigation

### Zustand middleware

Evaluate `subscribeWithSelector` and `immer` after store reducers are extracted.

- `subscribeWithSelector` may reduce broad UI rerenders and standing-order runner churn.
- `immer` may simplify nested reducer updates, but only if tests protect behavior first.
- Do not move durable app persistence to Zustand `persist` unless main-owned persistence becomes a real problem.

### Execa

Evaluate only for short-lived process tasks:

- CLI version probes
- installer dry-run checks
- one-shot helper commands

Keep native `spawn` for long-running provider streams unless Execa materially improves cancellation, stdout backpressure, and cleanup.

### Chokidar

Evaluate only if transcript polling misses events or becomes expensive. Polling is simple and reliable enough today. A Chokidar spike must prove it handles provider JSONL append behavior across macOS and packaged builds.

## Defer

### TanStack Virtual

Defer while `events[]` is capped and chat/activity lists remain bounded. Revisit if we remove the cap or keep long transcript history in the renderer.

### XState

Defer until provider process lifecycle complexity proves it needs a formal state machine. First improve the adapter interface and test lifecycle reducers.

## Implementation sequence

1. Land this stabilization pass.
2. Add Vitest and the first bridge normalizer tests.
3. Add Zod schemas around IPC and persisted/settings boundaries.
4. Extract store reducers and add standing-order/permission tests. **Started with standing-order and permission-letter domain helpers.**
5. Add provider installer idempotency tests. **Done for Claude, Cursor, Gemini, and Codex.**
6. Continue extracting the large store event reducer. **Store letter-action shell coverage is now in place.**
7. Start Radix-owned component wrappers and convert `DecreeModal`. **Done.**
8. Add Playwright Electron smoke tests after fixture-driven UI flows have stable selectors.

## Source links

- Architecture review: [`../reviews/architecture-review-2026-05-06.md`](../reviews/architecture-review-2026-05-06.md)
- Design-system CSS migration: [`design-system-css-migration.md`](./design-system-css-migration.md)
- Multi-choice permissions plan: [`multi-choice-permissions.md`](./multi-choice-permissions.md)
- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Vitest guide: https://vitest.dev/guide/
- Zod docs: https://zod.dev/
- Radix primitives: https://www.radix-ui.com/primitives/docs/components/dialog
- React Testing Library: https://testing-library.com/docs/react-testing-library/intro/
- Playwright Electron: https://playwright.dev/docs/api/class-electron
- Zustand middleware docs: https://zustand.docs.pmnd.rs/
- Execa: https://github.com/sindresorhus/execa
- Chokidar: https://github.com/paulmillr/chokidar
- TanStack Virtual: https://tanstack.com/virtual/latest/docs/introduction
