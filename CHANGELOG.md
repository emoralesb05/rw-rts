# Changelog

## [0.3.0] — 2026-04-30 — Multi-tool hook landing polish + handbook

The multi-tool hooks from 0.2.0 picked up real-use polish: cross-tool normalization, transcript watchers for the providers without an `assistant_text` hook, and a fix for the case where Codex 0.126's new rollout format made every Codex prompt look "interrupted" and disappear.

### Added
- Cross-tool tool-name normalization at the bridge (Cursor's `run_terminal_command_v2` → `Bash`, Codex's `command_execution` → `Bash`, etc.) so the renderer renders one card type per logical tool
- File-path links in the chat stream — always try `cursor://file/<path>` first, fall back to the OS default app
- Bash result blocks rendered terminal-style (dark background, exit-code chip, error tint)
- Edit / MultiEdit / Write diffs via Shiki — LCS-based line diff with 3-line context windows, syntax-highlighted
- `assistant_text` events from Claude / Codex via transcript watchers (`src/main/adapters/{claude,codex}-transcript.ts`) — neither tool fires an `afterAgentResponse` hook
- Inline permission markers in the conversation stream
- Tighter padding in the messages tab; Cursor opens by default for file links

### Fixed
- macOS traffic-light buttons no longer overlap top HUD widgets — added a 32px window-drag strip; HUD widgets shifted to top: 38px
- Codex 0.126+ assistant text now renders correctly — watcher handles both old (`item.completed` / `agent_message`) and new (`response_item` / `message` / `role=assistant` / `phase=final_answer`) rollout formats
- Interrupted-prompt heuristic stopped hiding any prompt whose response we missed — `Stop` no longer counts as a terminator, only the next `user_prompt` does

### Documentation
- Full handbook in [`.docs/`](./.docs/):
  - [`architecture/`](./.docs/architecture/) — processes, IPC, events, state, bridge, renderer, build, workspace, letters
  - [`providers/`](./.docs/providers/) — hooks (cross-tool), claude, codex, cursor, extending
  - [`glossary.md`](./.docs/glossary.md) — KH-themed and technical vocabulary
- `vision.md` relocated from `.docs/plans/` to `.docs/` (top-level) — strategic north star is its own thing, separate from tactical plans
- `roadmap.md` deleted — pre-keykeeper-rename, almost everything in it had either shipped or been explicitly excluded; git history preserves it
- `observed-resume.md` plan added under `.docs/plans/`

---

## [0.2.0] — 2026-04-29 — HUD redesign, polish, multi-tool hook installers

Major UX overhaul: dissolved the bottom command bar and side throne panel into a four-corner FFXIV-style HUD, added a floating panel system for wielder details / dispatch / settings, and brought in Cursor and Codex as first-class observable wielders alongside Claude.

### Added
**HUD & panels**
- Four-corner glass-pane HUD: WielderHUD top-left, AlertsHUD top-right, ActivityLog bottom-left, LettersHUD bottom-right
- `KingdomHeader` pill (top-center) with mute toggle and ⚙ kingdom panel access — replaces the deleted top toolbar
- Generic `FloatingPanel` shell with drag header, z-index stack focus, no backdrop, multi-panel coexistence
- Panel kinds: `wielder` (Status / Messages tabs), `kingdom` (Overview / Settings / Connection / Demos), `dispatch` (tool tabs + world picker + multi-line prompt), `settings` (legacy)
- Per-wielder Messages tab with a chat input pinned at the bottom (replaces the deleted bottom command bar's send role)
- Dispatch dialog (replaces the deleted bottom command bar's spawn role)
- Activity log smart click routing: textual events open the wielder Messages tab + scroll-to-event with gold pulse; permission events force-expand AlertsHUD and pulse the matching card; system markers non-clickable
- Per-wielder letter collapse (most-recent wins); letter body click pans camera to wielder's world
- Tabbed Kingdom panel (Overview / Settings / Connection / Demos)

**Polish**
- Wielder polish bundle: HP/MP rings (later replaced with FF14 nameplate bars), death pose, patrol idle behavior, drive auras, event-driven animation switching, subagent tether
- Renown star-rank UI on wielder cards (`visit + seal×3 − fall×2`, tiered New / Apprentice ★ / Veteran ★★ / Hero ★★★)
- Per-archetype voice barks (4 KH-flavored line pools: Vaelen brooding / Selene gentle / Ryder bold / Lyris wayfinder) on session_start / subagent_spawn / permission_request / session_end / KO / error
- FF14 HP/MP redesign: stacked vertical bars (HP green on top, MP blue below) on party rows + canvas sprites; multi-modal critical-HP feedback (red fill pulse + red border + bobbing "!")
- Tank/Healer/DPS behavior archetype chip on party rows + target panel meta, derived from recent-tool mix
- Live cast bar on party rows (slim purple striped sweep with `<tool> · <Ns>` while mid tool-call)
- Richer Halloween Town + Twilight Town landmark art

**Phase 2A subset**
- Tier 2 shaders: per-world atmospherics (water for Destiny Islands, fire for Halloween Town, magic energy for drives)
- Tier 3 shaders: KO impact pulse + seal fanfare flare
- Per-world particles, composite-form banners (Pair / Royal Guard / Wayfinder Trio), weighted MP costs (real-token MP per adapter)
- Chiptune ambient music loop (Aeolian arpeggio, "Dearly Beloved" cadence)

**Multi-tool hooks**
- Cursor hook installer (`src/main/cursor-hook-installer.ts`) — installs additive entries in `~/.cursor/hooks.json` for sessionStart/sessionEnd/stop/beforeSubmitPrompt/preToolUse/postToolUse/afterAgentResponse/beforeShellExecution
- Codex hook installer (`src/main/codex-hook-installer.ts`) — marker-block in `~/.codex/config.toml`; `--tool codex` flag tags payloads to disambiguate from Claude's identical PascalCase event names
- Cursor permission flow as observation-only (allowlist mode treats hook-allow as advisory; we return `"ask"` immediately)
- Per-world spawn target picker; spawned vs observed identity chip on wielder cards
- Workspace repo discovery: walk `~/.keykeeper.json` `workspaceRoot`, MAX_DEPTH=4, exclude-pattern matching

**Settings**
- `~/.keykeeper.json` with `workspaceRoot` + flexible `exclude` patterns (basename / `parent/repo` label / `dir/*` glob / `/abs/*` glob / exact absolute path)
- In-app Settings UI in the Kingdom panel with live workspace-root validation
- Back-compat: old `excludeRepos` key still honored

### Changed
- Permission flow switched from PreToolUse + risky-pattern detection to **`PermissionRequest` hook** — the right upstream signal (fires only when Claude would prompt; returning `decision.behavior` skips the prompt). No more double-confirms.
- Permission risk chip + reasoning context shown on permission letters (LOW / ELEVATED / HIGH)
- Stable spawn-time party-list ordering; target panel rendered as a floating dialog instead of a fixed pane
- Throne side panel + bottom command bar dissolved into the new four-corner HUD + per-wielder Messages tab + Dispatch dialog
- Activity log "Me → Agent" attribution on user prompts (clearer routing direction)

### Fixed
- Permission letters wait indefinitely instead of timing out client-side — the user decides when to answer
- Permission letters auto-dismiss when answered elsewhere (e.g., the user answered Claude's terminal prompt)
- Adapters no longer torn down on window-close on macOS — the app stays alive (Cmd-Q is the only true shutdown signal)
- Throne party-list ordering jitter

---

## [0.1.0] — 2026-04-28 — MVP shipped

End-to-end MVP: rename to keykeeper, Phaser 4 visual pipeline, atmosphere pass on all scenes, persistent state JSON, letter feed + decision moments, 5 v1 verbs (Dispatch / Send word / Comfort / Recall / Seal), session-end seal flow, Q40 unified Star Chart replacing the original 3-scene drill-down, and Phase 2B 9-of-9 in-scope items shipped.

### Added
**MVP P1–P10**
- P1 Rename to keykeeper (`package.json`, README, user-data path migrated)
- P2 Phaser 4 filter validation (CRT scanline + curvature, bloom, vignette)
- P3 Atmosphere pass on Gummi Map (Tier 1 shaders, gradient sky, parallax, particle drift)
- P4 Pixel-art sprite generator v2 — diverged in practice to hi-res painterly keybladers (~290×200/frame, 32-frame sheets) sourced via AI generation; Heartless and landmarks stayed 32×32 / 64×64 per spec
- P5 Atmosphere pass on World Arena + per-world theme swap + time-of-day cycle
- P6 Throne Room scene (React overlay; Phaser ambient backdrop deferred)
- P7 Persistent state JSON at `~/Library/Application Support/keykeeper/state.json`, debounced 200ms writes, wielder identity = `(tool, repoRoot)` tuple
- P8 Decision-moment letters + 5 v1 verbs wired
- P9 Cinematic dive + seal fanfare (KH chime + permanent gold-keyhole)
- P10 Honest README

**Q40 unified Star Chart**
- Single pan/zoom canvas (KingdomScene) replaces 3-scene Throne / Gummi / Arena drill-down
- Constellation clustering by parent directory
- Per-world iso plane + themed landmark + wielder sprites + heartless mobs + time-of-day overlay
- Click-card pans + zooms; manual drag pan + scroll-wheel zoom
- ~2200 lines net deleted from the legacy 3-scene infrastructure

**Phase 2B (9 of 9 in scope)**
- #11 Attention-direction priority queue banner
- #13a Stuck-loop detection with explanation
- #13b Why-trace expandable on tool calls
- #14 Decree composer (layered, `@` files / `/` commands)
- #14b Standing Order recurring-Decree sub-mode
- #15 Voice input (Web Speech API, transcription only)
- #17 Desktop OS notifications (Electron `Notification` API; 4 triggers, quiet hours 22:00–08:00)
- #18 Permission approval surface (initial: bridge bidirectional protocol via `PreToolUse` + risky-pattern detection — replaced 04-29)
- #12 Quest system **moved** to Phase 2A polish list

### Documentation
- `.docs/vision.md` introduced as canonical design doc; supersedes earlier `roadmap.md`
- Q40 unified-map architecture locked (Q40 + sub-decisions Q41–Q44)
- Q28–Q39 all locked or deferred (audience strictly personal-tidy, mobile deferred, Slack relay deferred, shared kingdoms deferred indefinitely)

---

## [0.0.1] — 2026-04-27 — Foundation

Pre-MVP scaffolding before the keykeeper rename. The project was still
called `kh-rts` at this point; the framing was "RTS visualizer" rather than
"agent watch room" — the Sims-style pivot landed in 0.1.0.

### Added
- Initial commit (Electron + Phaser 3 + React 19 + Zustand)
- Phaser upgrade to 4.0.0 + `@napi-rs/canvas`
- Expanded UnitRole definitions (Mickey, Ventus, Aqua, Terra, Roxas, Naminé, Cloud, Leon, Tifa, Aerith, Yuffie) with role mapping per tool
- Fixture / scripted-demo system (`src/main/adapters/fixture.ts`) with IPC + UI for triggering scenarios — emits synthetic AgentEvents on a timer for iterating without burning API tokens
- Character sprite assets + sprite-sheet generator script
- Skills documentation for animations, audio, cameras, curves, and data
- `bin/skills-add` wrapper to keep `.agents-mirror` dirs from scattering on every `npx skills add`
- Initial `roadmap.md` outlining status, principles, plans (later superseded by `vision.md` and deleted in 0.3.0)
