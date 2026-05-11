# Changelog

All notable changes to keykeeper. Format follows [Keep a Changelog](https://keepachangelog.com/) section names and [Conventional Commits](https://www.conventionalcommits.org/) `type(scope): subject` bullets. Hashes link to the commit on GitHub.

## [0.7.0] (2026-05-11)

This release batch finishes the world-aliveness pass: the Star Chart now reads more like an RTS command map, selected worlds get a dedicated command surface, and the tactical map is a real navigation control instead of a passive decoration.

### Features

- **world:** unified Star Chart aliveness pass with central base behavior, world state labels, route traffic, per-world activity mood, selection rings, richer world/enemy scale, and agents visibly operating across the map.
- **hud:** world-anchored WorldCommandHUD for selected worlds with focus / dispatch / seal actions, blocking-permission routing, recent signals, and clickable mission-line agents that open wielder status panels.
- **map:** tactical map now renders bottom-center through a HUD camera, stays translucent, projects the safe gameplay viewport, and supports clicking world markers plus click/drag panning.

### Bug Fixes

- **map:** tactical map viewport rectangle now clips against the minimap bounds and describes the visible gameplay window between HUD panels instead of the full canvas.
- **hud:** selected-world commands now render as a clamped contextual popover emerging from the world instead of a detached screen bar, with a wider mission-line column for long names and tool badges.
- **hud:** collapsible HUD widgets expose a single expand/collapse control to assistive tech, with the chevron rendered as a decorative state indicator.
- **world:** event VFX creation now guards against scene shutdown during dev reloads or late hook events.

### Tests

- **map:** added pure unit coverage for tactical map projection, safe-area viewport math, clipping, and click unprojection.
- **hud:** added component coverage for WorldCommandHUD command scope, world-anchored placement, status-panel opening, and same-name mission-line agent disambiguation.

### Documentation

- **docs:** renderer architecture, vision, README, and plan index now reflect the shipped world-aliveness/tactical-map work.

---

## [0.6.0] (2026-05-08)

This release stabilizes keykeeper's internal foundation after the Gemini provider work: runtime validation now uses shared Zod schemas, provider events flow through a normalized hook bridge, the renderer has a Radix/Tailwind design-system base, and the repo has first-class lint, format, style, typecheck, and unit-test coverage.

### Features

- **validation:** shared Zod schemas now cover settings, IPC payloads, provider events, permissions, installers, persisted state, transcripts, and renderer storage, with TypeScript types inferred from the schemas where useful ([9b8620e](https://github.com/emoralesb05/kh-rts/commit/9b8620e), [1cd0ff4](https://github.com/emoralesb05/kh-rts/commit/1cd0ff4), [a6fcf91](https://github.com/emoralesb05/kh-rts/commit/a6fcf91), [11c43a4](https://github.com/emoralesb05/kh-rts/commit/11c43a4))
- **tests:** Vitest coverage now exercises schema parsing, settings persistence, IPC validation, hook installers, hook dedupe, hook bridge behavior, transcript adapters, desktop notifications, unit identity, role archetypes, and store-domain reducers ([dc21c0c](https://github.com/emoralesb05/kh-rts/commit/dc21c0c), [3f5c9da](https://github.com/emoralesb05/kh-rts/commit/3f5c9da), [a6fcf91](https://github.com/emoralesb05/kh-rts/commit/a6fcf91))
- **design-system:** Radix primitives and owned UI kit components now live under `src/renderer/src/ui/components/`, including dialog, alert dialog, dropdown, popover, select, tabs, toast, tooltip, command, checkbox, radio group, switch, scroll area, and reusable kit pieces ([75fcd42](https://github.com/emoralesb05/kh-rts/commit/75fcd42), [ae1faa0](https://github.com/emoralesb05/kh-rts/commit/ae1faa0), [6e5356f](https://github.com/emoralesb05/kh-rts/commit/6e5356f), [eef7e09](https://github.com/emoralesb05/kh-rts/commit/eef7e09), [86db4e3](https://github.com/emoralesb05/kh-rts/commit/86db4e3), [00c97d8](https://github.com/emoralesb05/kh-rts/commit/00c97d8), [366d5fd](https://github.com/emoralesb05/kh-rts/commit/366d5fd))
- **permissions:** IPC payload validation and permission helpers were tightened so provider permission events have one typed shape across main, preload, renderer, and tests ([11c43a4](https://github.com/emoralesb05/kh-rts/commit/11c43a4))

### Bug Fixes

- **ui:** polished chat drawer, HUD, tab, button, spacing, wrapping, and panel layouts after the CSS migration so the new component foundation preserves the expected sticky and responsive behavior ([0fb2098](https://github.com/emoralesb05/kh-rts/commit/0fb2098), [c48b773](https://github.com/emoralesb05/kh-rts/commit/c48b773))

### Refactor

- **hook-bridge:** provider event parsing now runs through normalized hook and transcript schemas, reducing provider-specific branching and making Claude, Codex, Cursor, and Gemini streams easier to validate consistently ([1cd0ff4](https://github.com/emoralesb05/kh-rts/commit/1cd0ff4), [a6fcf91](https://github.com/emoralesb05/kh-rts/commit/a6fcf91))
- **css:** large bespoke stylesheet rules were migrated into Tailwind utilities, tokens, and design-system components; `styles.css` is now focused on theme tokens, keyframes, Tailwind sources, and remaining global behavior ([a498cc0](https://github.com/emoralesb05/kh-rts/commit/a498cc0), [c772ce6](https://github.com/emoralesb05/kh-rts/commit/c772ce6), [15187cf](https://github.com/emoralesb05/kh-rts/commit/15187cf), [dadc20f](https://github.com/emoralesb05/kh-rts/commit/dadc20f))
- **renderer:** UI components were reorganized under `src/renderer/src/ui/`, with primitives and kit components separated by responsibility while preserving direct imports instead of barrel re-exports ([40b8c4c](https://github.com/emoralesb05/kh-rts/commit/40b8c4c))

### Documentation

- **architecture:** architecture docs now include the current Gemini support, IPC/state/schema direction, renderer organization, and OSS-adoption review notes ([045dba4](https://github.com/emoralesb05/kh-rts/commit/045dba4), [7805a6e](https://github.com/emoralesb05/kh-rts/commit/7805a6e))
- **design:** design-system planning was replaced by concrete design docs for components and tokens after the Radix/Tailwind foundation landed ([80d53b6](https://github.com/emoralesb05/kh-rts/commit/80d53b6), [dadc20f](https://github.com/emoralesb05/kh-rts/commit/dadc20f))

### Chores

- **lint:** added ESLint flat config, Prettier with `prettier-plugin-tailwindcss`, Stylelint, strict lint scripts, format checks, and VS Code CSS settings for Tailwind v4 at-rules ([cb25501](https://github.com/emoralesb05/kh-rts/commit/cb25501), [4c0ff7f](https://github.com/emoralesb05/kh-rts/commit/4c0ff7f))

---

## [0.5.0] (2026-05-06)

Gemini lands as keykeeper's fourth provider. The app can now observe external Gemini CLI sessions, spawn Gemini turns through `stream-json`, route Gemini tool and response events through the shared bridge, and own Gemini tool approvals with a fail-closed `BeforeTool` gate plus managed native policy. This release also adds the Command Palette and documents the next permission-model upgrade.

### Features

- **gemini:** first-class Gemini CLI provider with installable hooks, active spawn support, provider docs, UI connection status, and fixture/demo wiring ([f930aac](https://github.com/emoralesb05/kh-rts/commit/f930aac))
- **gemini:** active spawns stream assistant text and tool activity from `gemini --prompt ... --output-format stream-json`, with follow-ups routed through `--resume <session-id>` ([f930aac](https://github.com/emoralesb05/kh-rts/commit/f930aac))
- **gemini:** permission flow now uses the synchronous `BeforeTool` hook as Keykeeper's allow/deny gate while dropping Gemini's observation-only `Notification/ToolPermission` card noise ([9404da4](https://github.com/emoralesb05/kh-rts/commit/9404da4), [ce08523](https://github.com/emoralesb05/kh-rts/commit/ce08523))
- **gemini:** managed policy at `~/.gemini/policies/keykeeper-managed.toml` suppresses Gemini's native prompt after Keykeeper has already gated the tool; hook command runs with `KEYKEEPER_GEMINI_FAIL_CLOSED=1` so tools are denied if Keykeeper is unavailable ([f56e365](https://github.com/emoralesb05/kh-rts/commit/f56e365))
- **gemini:** subagent events are modeled through `invoke_agent` / `invoke_subagent` canonicalization and transcript-path parent linking, so Gemini child sessions nest under their parent when metadata is available ([9404da4](https://github.com/emoralesb05/kh-rts/commit/9404da4))
- **ui:** Command Palette for quick navigation and actions, including permission-alert focus routing and keyboard access from the main app chrome ([afecd88](https://github.com/emoralesb05/kh-rts/commit/afecd88))

### Bug Fixes

- **hook-bridge:** transcript parent detection now validates the expected chat directory shape before deriving a parent session id ([6fe16cd](https://github.com/emoralesb05/kh-rts/commit/6fe16cd))
- **permissions:** stale actionable letters clear when a provider closes the pending hook socket before the UI can answer, preventing dead allow/deny buttons after Gemini timeouts or process restarts ([f56e365](https://github.com/emoralesb05/kh-rts/commit/f56e365))

### Refactor

- **gemini:** split native prompt suppression from the Keykeeper gate: Keykeeper remains the real permission decision point, while Gemini's policy layer only prevents a duplicate second prompt ([f56e365](https://github.com/emoralesb05/kh-rts/commit/f56e365))
- **permissions:** letter shortcut text now derives from the actual action label, keeping `A` / `D` hints correct as provider-specific wording changes ([f56e365](https://github.com/emoralesb05/kh-rts/commit/f56e365))

### Documentation

- **providers:** Gemini provider documentation added and cross-provider hook docs updated for Gemini events, spawn/resume behavior, managed policy, and known quirks ([f930aac](https://github.com/emoralesb05/kh-rts/commit/f930aac), [f56e365](https://github.com/emoralesb05/kh-rts/commit/f56e365))
- **plans:** `gemini-provider.md` deleted after landing; `multi-choice-permissions.md` added as the next cross-provider research and implementation plan ([f56e365](https://github.com/emoralesb05/kh-rts/commit/f56e365))
- **changelog:** release notes reformatted to the current Keep-a-Changelog / Conventional Commits style ([364bc56](https://github.com/emoralesb05/kh-rts/commit/364bc56))

---

## [0.4.0] (2026-05-01)

Multi-wielder **ChatDrawer** replaces the per-wielder Messages tab. macOS `.app` / `.dmg` packaging via electron-builder. Lucide icon library swept in across the app. Centralized `~/.keykeeper/` state directory. Window icon + title now show in dev.

### Features

- **hud/chat:** ChatDrawer — singleton right-edge tabbed conversation surface ([043cde2](https://github.com/emoralesb05/kh-rts/commit/043cde2))
  - browser-style tabs: per-tab × close, status dots (red = pending permission, yellow = unread)
  - drag-to-resize the left edge; width persists across sessions
  - minimize-to-pill between AlertsHUD and LettersHUD; click any chip to expand + activate
  - click-to-focus z-stack with floating panels and AlertsHUD
- **hud/chat:** ActivityLog row clicks now open a drawer tab + scroll the stream to the exact event with a gold pulse ([043cde2](https://github.com/emoralesb05/kh-rts/commit/043cde2))
- **hud:** Lucide icon library replaces ASCII glyphs across `ConversationStream`, `HudWidget`, `ActivityLog`, `WielderPanelBody`, `KingdomHeader`, `LetterCard`, `LettersHUD`, `PartyRow`, `CloseAllChip`, `DispatchPanelBody`, `DecreeModal` ([043cde2](https://github.com/emoralesb05/kh-rts/commit/043cde2))
- **hud:** open/close animations on every HUD section — width 340 ↔ 180px and body height `grid-template-rows: 1fr ↔ 0fr` for smooth collapse without fixed-pixel max-heights ([043cde2](https://github.com/emoralesb05/kh-rts/commit/043cde2))
- **hud:** unified header pattern — title → count → optional action chip → chevron pinned right (each chip stays clickable in its own button) ([043cde2](https://github.com/emoralesb05/kh-rts/commit/043cde2))
- **build:** packageable `.app` + `.dmg` via electron-builder (`bun run dist`) ([2ce67dd](https://github.com/emoralesb05/kh-rts/commit/2ce67dd))
- **build:** application bundle icon from `build/icon.png` ([15b4ae1](https://github.com/emoralesb05/kh-rts/commit/15b4ae1))
- **main:** window icon + title in dev (`app.dock.setIcon` on macOS) so the keykeeper icon shows without packaging ([149a63b](https://github.com/emoralesb05/kh-rts/commit/149a63b))

### Bug Fixes

- **bridge:** EPIPE storm on dev restart from per-event `console.log` — gated behind `KEYKEEPER_DEBUG_BRIDGE` env var ([149a63b](https://github.com/emoralesb05/kh-rts/commit/149a63b))
- **main:** uncaught exceptions when hook events arrive after window close — `webContents.isDestroyed()` guard before `wc.send` ([aca8629](https://github.com/emoralesb05/kh-rts/commit/aca8629))
- **chat:** "why" expander button — SVG was stacking above the word ("display: block" default on `<button>`); fixed with `inline-flex + gap` ([149a63b](https://github.com/emoralesb05/kh-rts/commit/149a63b))
- **hud:** ActivityLog count alignment — was pushed right by `flex: 1`; now matches the HUDs (count tight to title, chevron `margin-left: auto` to the right edge) ([149a63b](https://github.com/emoralesb05/kh-rts/commit/149a63b))

### Refactor

- **hooks:** install hook script to `~/.keykeeper/keykeeper-hook` (centralized state dir alongside `state.json` / `config.json`); `syncHookScript()` runs every boot to keep the installed copy in sync with the bundled version ([6d36e8d](https://github.com/emoralesb05/kh-rts/commit/6d36e8d))
- **panels:** WielderPanel is now Status-only — Messages tab moved to ChatDrawer; Status panel adds a `chat` verb that opens a drawer tab ([043cde2](https://github.com/emoralesb05/kh-rts/commit/043cde2))
- **css:** drop ~127 lines of dead Messages-tab CSS — `.chat-panel`, `.chat-panel-header`, `.chat-clear`, `.wielder-panel-log` family, `.floating-panel-fixed-height` family ([149a63b](https://github.com/emoralesb05/kh-rts/commit/149a63b))

### Documentation

- README + `.docs/vision.md` updated for ChatDrawer + Status-only wielder panel ([149a63b](https://github.com/emoralesb05/kh-rts/commit/149a63b))
- `.docs/architecture/renderer.md` rewritten for the drawer-as-singleton pattern and the components-bound design-system direction ([149a63b](https://github.com/emoralesb05/kh-rts/commit/149a63b))
- `.docs/architecture/build.md` updated for `~/.keykeeper/` paths + the `pack` / `dist` targets ([dfbad5d](https://github.com/emoralesb05/kh-rts/commit/dfbad5d))
- new plans queued for the next phase ([311cbd8](https://github.com/emoralesb05/kh-rts/commit/311cbd8), [a9190d4](https://github.com/emoralesb05/kh-rts/commit/a9190d4), [9354906](https://github.com/emoralesb05/kh-rts/commit/9354906)):
  - `gemini-provider.md` — Google Gemini CLI as a fourth observable tool
  - `world-aliveness.md` — sprite behavior + canvas reactivity
  - `design-system.md` — Radix Primitives + Tailwind v4 with shadcn-style owned components under `src/renderer/src/components/`
- `chat-drawer.md` plan deleted on landing — implementation matched the spec; git history preserves it ([d55cad8](https://github.com/emoralesb05/kh-rts/commit/d55cad8))
- sweep "Messages tab" → "chat drawer" across 12 sites in code, plans, and docs ([149a63b](https://github.com/emoralesb05/kh-rts/commit/149a63b))

### Chores

- bump version to 0.4.0 ([50bf6b9](https://github.com/emoralesb05/kh-rts/commit/50bf6b9))

---

## [0.3.0] (2026-04-30)

The multi-tool hooks from 0.2.0 picked up real-use polish: cross-tool normalization, transcript watchers for the providers without an `assistant_text` hook, and a fix for the case where Codex 0.126's new rollout format made every Codex prompt look "interrupted" and disappear.

### Features

- **chat:** cross-tool tool-name normalization at the bridge (Cursor's `run_terminal_command_v2` → `Bash`, Codex's `command_execution` → `Bash`, etc.) so the renderer renders one card type per logical tool ([93d483b](https://github.com/emoralesb05/kh-rts/commit/93d483b))
- **chat:** file-path links in the chat stream — try `cursor://file/<path>` first, fall back to OS default ([93d483b](https://github.com/emoralesb05/kh-rts/commit/93d483b))
- **chat:** Bash result blocks rendered terminal-style (dark background, exit-code chip, error tint) ([6b762a1](https://github.com/emoralesb05/kh-rts/commit/6b762a1))
- **chat:** Edit / MultiEdit / Write diffs via Shiki — LCS-based line diff, 3-line context windows, syntax-highlighted ([8aaf9c2](https://github.com/emoralesb05/kh-rts/commit/8aaf9c2))
- **chat:** `assistant_text` events from Claude / Codex via transcript watchers (`src/main/adapters/{claude,codex}-transcript.ts`) — neither tool fires an `afterAgentResponse` hook ([ffbb50a](https://github.com/emoralesb05/kh-rts/commit/ffbb50a))
- **chat:** inline permission markers in the conversation stream; tighter padding in the messages tab; Cursor opens by default for file links ([ffbb50a](https://github.com/emoralesb05/kh-rts/commit/ffbb50a))

### Bug Fixes

- **hud:** macOS traffic-light buttons no longer overlap top HUD widgets — added 32px window-drag strip; HUD widgets shifted to top: 38px ([fd2afa5](https://github.com/emoralesb05/kh-rts/commit/fd2afa5))
- **chat:** Codex 0.126+ assistant text now renders correctly — watcher handles both old (`item.completed` / `agent_message`) and new (`response_item` / `message` / `role=assistant` / `phase=final_answer`) rollout formats ([cbe4264](https://github.com/emoralesb05/kh-rts/commit/cbe4264))
- **chat:** interrupted-prompt heuristic stopped hiding any prompt whose response we missed — `Stop` no longer counts as a terminator, only the next `user_prompt` does ([cbe4264](https://github.com/emoralesb05/kh-rts/commit/cbe4264))
- **hooks:** post-Codex review findings addressed; documented known gaps ([09fd1e9](https://github.com/emoralesb05/kh-rts/commit/09fd1e9))

### Documentation

- full handbook in [`.docs/`](./.docs/) ([2179752](https://github.com/emoralesb05/kh-rts/commit/2179752)):
  - [`architecture/`](./.docs/architecture/) — processes, IPC, events, state, bridge, renderer, build, workspace, letters
  - [`providers/`](./.docs/providers/) — hooks (cross-tool), claude, codex, cursor, extending
  - [`glossary.md`](./.docs/glossary.md) — KH-themed and technical vocabulary
- `vision.md` relocated from `.docs/plans/` to `.docs/` (top-level) — strategic north star is its own thing, separate from tactical plans ([f3edb1f](https://github.com/emoralesb05/kh-rts/commit/f3edb1f))
- `roadmap.md` deleted — pre-keykeeper-rename, almost everything in it had either shipped or been explicitly excluded; git history preserves it
- new concept art images for project visualization ([81d357b](https://github.com/emoralesb05/kh-rts/commit/81d357b))
- CHANGELOG introduced; README updated for configuration changes ([c1a22e5](https://github.com/emoralesb05/kh-rts/commit/c1a22e5))

---

## [0.2.0] (2026-04-29)

Major UX overhaul: dissolved the bottom command bar and side throne panel into a four-corner FFXIV-style HUD, added a floating panel system for wielder details / dispatch / settings, and brought in Cursor and Codex as first-class observable wielders alongside Claude.

### Features

#### HUD & panels

- four-corner glass-pane HUD: WielderHUD top-left, AlertsHUD top-right, ActivityLog bottom-left, LettersHUD bottom-right
- `KingdomHeader` pill (top-center) with mute toggle and ⚙ kingdom panel access — replaces the deleted top toolbar
- generic `FloatingPanel` shell with drag header, z-index stack focus, no backdrop, multi-panel coexistence
- panel kinds: `wielder` (Status / Messages tabs), `kingdom` (Overview / Settings / Connection / Demos), `dispatch` (tool tabs + world picker + multi-line prompt), `settings` (legacy)
- per-wielder Messages tab with chat input pinned at the bottom (replaces the bottom command bar's send role)
- Dispatch dialog (replaces the bottom command bar's spawn role)
- ActivityLog smart click routing: textual events open the wielder Messages tab + scroll-to-event with gold pulse; permission events force-expand AlertsHUD and pulse the matching card; system markers non-clickable
- per-wielder letter collapse (most-recent wins); letter body click pans camera to wielder's world
- tabbed Kingdom panel (Overview / Settings / Connection / Demos)

#### Polish

- wielder polish bundle: HP/MP rings (later replaced with FF14 nameplate bars), death pose, patrol idle behavior, drive auras, event-driven animation switching, subagent tether
- Renown star-rank UI on wielder cards (`visit + seal×3 − fall×2`, tiered New / Apprentice ★ / Veteran ★★ / Hero ★★★)
- per-archetype voice barks (Vaelen brooding / Selene gentle / Ryder bold / Lyris wayfinder) on session_start / subagent_spawn / permission_request / session_end / KO / error
- FF14 HP/MP redesign: stacked vertical bars (HP green on top, MP blue below) on party rows + canvas sprites; multi-modal critical-HP feedback (red fill pulse + red border + bobbing "!")
- Tank/Healer/DPS behavior archetype chip on party rows + target panel, derived from recent-tool mix
- live cast bar on party rows (slim purple striped sweep with `<tool> · <Ns>` while mid tool-call)
- richer Halloween Town + Twilight Town landmark art

#### Phase 2A subset

- Tier 2 shaders: per-world atmospherics (water for Destiny Islands, fire for Halloween Town, magic energy for drives)
- Tier 3 shaders: KO impact pulse + seal fanfare flare
- per-world particles, composite-form banners (Pair / Royal Guard / Wayfinder Trio), weighted MP costs
- chiptune ambient music loop (Aeolian arpeggio, "Dearly Beloved" cadence)

#### Multi-tool hooks

- Cursor hook installer (`src/main/cursor-hook-installer.ts`) — installs additive entries in `~/.cursor/hooks.json` for sessionStart/sessionEnd/stop/beforeSubmitPrompt/preToolUse/postToolUse/afterAgentResponse/beforeShellExecution
- Codex hook installer (`src/main/codex-hook-installer.ts`) — marker-block in `~/.codex/config.toml`; `--tool codex` flag tags payloads to disambiguate from Claude's identical PascalCase event names
- Cursor permission flow as observation-only (allowlist mode treats hook-allow as advisory)
- per-world spawn target picker; spawned vs observed identity chip on wielder cards
- workspace repo discovery: walk `~/.keykeeper.json` `workspaceRoot`, MAX_DEPTH=4, exclude-pattern matching

#### Settings

- `~/.keykeeper.json` with `workspaceRoot` + flexible `exclude` patterns (basename / `parent/repo` / `dir/*` / `/abs/*` / exact absolute path)
- in-app Settings UI in the Kingdom panel with live workspace-root validation
- back-compat: old `excludeRepos` key still honored

### Refactor

- permission flow switched from PreToolUse + risky-pattern detection to **`PermissionRequest` hook** — fires only when Claude would prompt; returning `decision.behavior` skips the prompt. No more double-confirms.
- permission risk chip + reasoning context shown on permission letters (LOW / ELEVATED / HIGH)
- stable spawn-time party-list ordering; target panel rendered as a floating dialog instead of a fixed pane
- throne side panel + bottom command bar dissolved into the four-corner HUD + per-wielder Messages tab + Dispatch dialog
- ActivityLog "Me → Agent" attribution on user prompts (clearer routing direction)

### Bug Fixes

- permission letters wait indefinitely instead of timing out client-side — the user decides when to answer
- permission letters auto-dismiss when answered elsewhere (e.g., user answered Claude's terminal prompt)
- adapters no longer torn down on window-close on macOS — Cmd-Q is the only true shutdown signal
- throne party-list ordering jitter

---

## [0.1.0] (2026-04-28)

End-to-end MVP: rename to keykeeper, Phaser 4 visual pipeline, atmosphere pass on all scenes, persistent state JSON, letter feed + decision moments, 5 v1 verbs (Dispatch / Send word / Comfort / Recall / Seal), session-end seal flow, Q40 unified Star Chart replacing the original 3-scene drill-down, and Phase 2B 9-of-9 in-scope items shipped.

### Features

#### MVP P1–P10

- P1 rename to keykeeper (`package.json`, README, user-data path migrated)
- P2 Phaser 4 filter validation (CRT scanline + curvature, bloom, vignette)
- P3 atmosphere pass on Gummi Map (Tier 1 shaders, gradient sky, parallax, particle drift)
- P4 pixel-art sprite generator v2 — diverged in practice to hi-res painterly keybladers (~290×200/frame, 32-frame sheets) sourced via AI generation; Heartless and landmarks stayed 32×32 / 64×64 per spec
- P5 atmosphere pass on World Arena + per-world theme swap + time-of-day cycle
- P6 Throne Room scene (React overlay; Phaser ambient backdrop deferred)
- P7 persistent state JSON at `~/Library/Application Support/keykeeper/state.json`, debounced 200ms writes, wielder identity = `(tool, repoRoot)` tuple
- P8 decision-moment letters + 5 v1 verbs wired
- P9 cinematic dive + seal fanfare (KH chime + permanent gold-keyhole)
- P10 honest README

#### Q40 unified Star Chart

- single pan/zoom canvas (KingdomScene) replaces 3-scene Throne / Gummi / Arena drill-down
- constellation clustering by parent directory
- per-world iso plane + themed landmark + wielder sprites + heartless mobs + time-of-day overlay
- click-card pans + zooms; manual drag pan + scroll-wheel zoom
- ~2200 lines net deleted from the legacy 3-scene infrastructure

#### Phase 2B (9 of 9 in scope)

- #11 attention-direction priority queue banner
- #13a stuck-loop detection with explanation
- #13b why-trace expandable on tool calls
- #14 Decree composer (layered, `@` files / `/` commands)
- #14b Standing Order recurring-Decree sub-mode
- #15 voice input (Web Speech API, transcription only)
- #17 desktop OS notifications (Electron `Notification` API; 4 triggers, quiet hours 22:00–08:00)
- #18 permission approval surface (initial: bridge bidirectional protocol via `PreToolUse` + risky-pattern detection — replaced 04-29)
- #12 quest system **moved** to Phase 2A polish list

### Documentation

- `.docs/vision.md` introduced as canonical design doc; supersedes earlier `roadmap.md`
- Q40 unified-map architecture locked (Q40 + sub-decisions Q41–Q44)
- Q28–Q39 all locked or deferred (audience strictly personal-tidy, mobile deferred, Slack relay deferred, shared kingdoms deferred indefinitely)

---

## [0.0.1] (2026-04-27)

Pre-MVP scaffolding before the keykeeper rename. The project was still called `kh-rts` at this point; the framing was "RTS visualizer" rather than "agent watch room" — the Sims-style pivot landed in 0.1.0.

### Features

- initial commit (Electron + Phaser 3 + React 19 + Zustand)
- Phaser upgrade to 4.0.0 + `@napi-rs/canvas`
- expanded UnitRole definitions (Mickey, Ventus, Aqua, Terra, Roxas, Naminé, Cloud, Leon, Tifa, Aerith, Yuffie) with role mapping per tool
- fixture / scripted-demo system (`src/main/adapters/fixture.ts`) with IPC + UI for triggering scenarios — emits synthetic AgentEvents on a timer for iterating without burning API tokens
- character sprite assets + sprite-sheet generator script
- skills documentation for animations, audio, cameras, curves, and data
- `bin/skills-add` wrapper to keep `.agents-mirror` dirs from scattering on every `npx skills add`
- initial `roadmap.md` outlining status, principles, plans (later superseded by `vision.md` and deleted in 0.3.0)
