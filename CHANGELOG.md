# Changelog

All notable changes to keykeeper. Format follows [Keep a Changelog](https://keepachangelog.com/) section names and [Conventional Commits](https://www.conventionalcommits.org/) `type(scope): subject` bullets. Hashes link to the commit on GitHub.

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
