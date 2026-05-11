# keykeeper — Vision & Open Questions

The strategic north star — philosophy, design model, locked decisions
Q1–Q44, open questions, known gaps, and backlog. Forward-looking.

For **what shipped when**, see [`../CHANGELOG.md`](../CHANGELOG.md).
For **tactical per-feature plans**, see [`./plans/`](./plans/).
For **how things are built today**, see [`./architecture/`](./architecture/) and [`./providers/`](./providers/).
For **vocabulary**, see [`./glossary.md`](./glossary.md).

> Repo dir on disk is still `kh-rts/` — npm package is `keykeeper`.

## Table of contents

- [TL;DR](#tldr)
- [What this is (and isn't)](#what-this-is-and-isnt)
- [Non-goals](#non-goals)
- [Core loop](#core-loop)
- [Scenes](#scenes)
- [Player verbs (six)](#player-verbs-six)
- [State model](#state-model--what-maps-to-what)
- [Visual direction](#visual-direction)
- [Build phases (framework)](#build-phases-framework)
- [Locked decisions](#locked-decisions-q1q27) (Q1–Q27, frozen reference)
- [Open questions](#open-questions-q28q44) (Q28–Q44, all decided as of 2026-04-28)
- [Backlog](#backlog) — deferred but on radar
- [Known gaps](#known-gaps) — forward-looking technical work

---

## TL;DR

**keykeeper is a Kingdom-Hearts-themed *agent watch room* — a Sims-style
spectator strategy app where the player is the King at Disney Castle, their
keyblade wielders (Claude / Cursor / Codex sessions) are out clearing worlds
(repos), and the player nudges, dispatches, and witnesses rather than
commanding tick-by-tick.**

Real agent activity drives autonomous Sim behavior. v1 verbs are strictly
gentle (Dispatch, Send word, Comfort, Recall, Seal). Phase 2B adds a
sixth — **Decree** (directive: target file/function/command) — kept
visually distinct so the spectator-strategy tone holds while the directive
flow is first-class. The visual goal is a distinctive, atmospheric stylized
2D look (currently: hi-res painterly pixel-art keybladers on a 2D iso plane,
with CRT + bloom + vignette filter pipeline).

---

## What this is (and isn't)

**It is**: a long-running, ambient, observational tool that makes monitoring
multiple agent sessions feel like *watching a kingdom unfold*. Closer to
Football Manager / Frostpunk / The Sims than to StarCraft.

**It is not**: an RTS. The player does not command units tick-by-tick. The
agents have their own minds (literally). RTS framing was wrong because it
oversells player agency the loop doesn't actually have. (Phase 2B's
**Decree** verb is directive but framed as a King's formal proclamation,
not tick-by-tick commanding — see § Player verbs.)

---

## Non-goals

Explicitly **not** building, even if adjacent products do:

- **Multi-tenant SaaS / hosted product** — personal-tidy is the locked
  audience trajectory (Q3 + Q28). If that flips, this section flips
  with it.
- **Mobile companion / PWA** — deferred per Q29 (see Backlog). Real pain
  today is desktop attention-direction with multiple parallel agents,
  not AFK monitoring. Notifications stay (as desktop OS notifications,
  not Web Push). Revive when an AFK / on-the-go use case emerges.
- **Tick-by-tick RTS commanding** — the agents have their own minds; the
  player nudges and decrees, never micromanages.
- **AgentCraft's "Alliance Hall" multi-King co-op rooms** — solo
  workflow today; shared kingdoms is deferred until a real teammate use
  case emerges (Q33–Q35).
- **Skill Scrolls / Achievements / Race Skins gamification** — too gamey
  for the KH-Sims tone.
- **Integrated PTY terminal in the HUD** — the King doesn't open a
  shell; wielders do.
- **Cross-platform investment** — macOS-first (Q3); other platforms
  work but untested.
- **Real-time win/lose mechanics** — Heartless and Drives are flavor
  for narrative texture, not balanced game systems.

### Player fantasy

> *You are the King at Disney Castle. Your kingdom is your repos. Each
> world's heart is clouded by tasks; Heartless are the errors and blockers.
> You dispatch keyblade wielders to clear them, receive their reports, summon
> help when worlds fall, and seal each cleared world's keyhole when its
> story is done.*

---

## Core loop

```
Survey  →  Notice (alert)  →  Dive  →  Intervene  →  Witness  →  Survey
```

Readable in 30 seconds, even from peripheral vision. The whole thing should
work as a thing-in-the-corner-of-your-monitor, not a thing-you-stare-at.

- **Survey**: home base, every world's state at a glance (Throne Room)
- **Notice**: a planet pulses red — kingdom-wide telemetry pulls the eye
- **Dive**: warp into the world to watch the wielder work (World Arena)
- **Intervene**: 1 of 6 verbs (below)
- **Witness**: world cleared (sealed, fanfare) or fallen (KO)

---

## Scenes

> **Q40 (2026-04-28):** the original three scenes (Throne / Gummi /
> Arena) collapsed into a single unified Star Chart canvas. The
> KingdomScene below is what runs today.

### Unified Star Chart (KingdomScene)

One Phaser scene renders the entire kingdom in a single pan/zoom
canvas. Every repo is a world; every world contains a per-world iso
plane with its themed landmark, ground tiles, ambient particles, and
the wielders working there. Camera control is manual (drag-pan,
scroll-wheel zoom); clicking a wielder card, letter, world, or
tactical-map marker pans + zooms to that world. The tactical map is
bottom-center and interactive: world markers select/focus worlds, while
empty-space clicks/drags pan the Star Chart. Selecting a world opens a
clamped command popover from that world's screen position, so the command
surface reads as part of the map rather than as a detached bottom bar.
Filter pipeline runs scene-wide:

- **Tier 1 (always on):** scanline + bloom + per-scene color grade +
  vignette
- **Tier 2 (per-world atmospherics):** drifting cyan ribbons in
  Destiny Islands, flickering ember pools in Halloween Town, counter-
  rotating purple arcs in Hollow Bastion
- **Tier 3 (event pulses):** barrel-pinch + pixelate spike on KO,
  golden bloom flare on keyhole seal

Per-wielder rendering: hi-res painterly pixel-art sprite (~290×200,
scaled to fit the iso plane), drive-form aura, FF14 nameplate-style
HP/MP bars at the feet (multi-modal critical-HP feedback: red fill +
red border + bobbing "!" alert), KH-flavored speech bubbles per
archetype (Vaelen brooding / Selene gentle / Ryder bold / Lyris
wayfinder) on session_start / subagent_spawn / permission_request /
session_end success / KO / error. Drive forms (Valor / Wisdom /
Final) trigger activation flashes; subagent tether visualizes parent-
child relationships.

### HUD overlay

FFXIV-style four-corner HUD on top of the canvas. Each widget is an
absolute-positioned glass pane (translucent dark panel + accent
border) with a collapsible header. State persists per widget via
localStorage (`keykeeper:hud:collapsed:<title>`).

- **Top-center: KingdomHeader pill** — `⌬ Keykeeper · ✦ N sealed · ⚔ N
  wielders · µ N · founded Nd ago · 🔊 ⚙`. Mute toggle + ⚙ opens the
  Kingdom panel. Replaces the old top toolbar.
- **Top-left: WielderHUD** — party list with role-colored portrait,
  name, tool pill, behavior-class chip (Tank/Healer/DPS/Roamer), HP/
  MP stacked bars, status icons (drive / casting / standing-order /
  HP-critical), live cast bar, 💬 chat shortcut, `+ DISPATCH` button.
  Hides ghosted wielders by default with a `✦ N` toggle.
- **Top-right: AlertsHUD** — orange-toned. Permission-request letters
  as inline action cards (allow / deny / deny-with-reason). Activity-
  row clicks on permission events force-expand this widget if it's
  collapsed.
- **Bottom-left: ActivityLog** — one-line summaries. Tone-coded.
  Click textual rows → opens a chat-drawer tab for that wielder and
  scrolls the stream to the event with a gold pulse. Click permission
  rows → pulse the matching alert. System markers (session_start/end,
  subagent_spawn) non-clickable.
- **World-anchored: WorldCommandHUD** — selected-world command popover
  emerging from the focused world. It owns world-level focus / dispatch /
  seal actions, blocking-permission signal, recent signals, and clickable
  mission-line agents that open wielder status panels.
- **Bottom-right: LettersHUD** — informational letters, one per
  wielder (most-recent wins). Body click pans canvas to wielder's
  world. `✕ clear` button to drop all at once.
- **Right edge: ChatDrawer** — singleton, tabbed (one tab per wielder
  the King opens). Browser-style tabs with per-tab × close and status
  dots (red = pending permission, yellow = unread). Drag the left
  edge to resize; minimize collapses to a thin floating pill between
  Alerts and Letters. Tab body = ConversationStream + chat input.

### Floating panels

Generic FloatingPanel shell (drag header, z-index stack focus, no
backdrop, multiple coexist). Panel kinds:

- **`wielder`** — Status only. Portrait + bars + meta + action card
  with verbs (chat / find / decree / comfort / recall). The chat
  verb opens a tab in the right-edge ChatDrawer.
- **`kingdom`** — Overview / Settings / Connection / Demos tabs.
- **`dispatch`** — tool tabs / target world picker / multi-line
  prompt textarea / Cancel / ▶ Spawn.
- **`settings`** (legacy standalone, also embedded in Kingdom).

Cmd+Shift+W or the `✕ close N` chip closes all open panels.

### Worlds

6 themed worlds assigned by hash of repo root: Disney Castle, Hollow
Bastion, Traverse Town, Destiny Islands, Twilight Town, Halloween
Town. Pixel-art landmarks at 64×64. Per-theme atmospherics + signature
decorations + color grade.

---

## Player verbs (six)

> Originally locked at "exactly five gentle verbs" in the v1 design. The
> sixth verb (**Decree**) was added 2026-04-28 after surfacing a real
> workflow split between *gentle* (check-in, comfort) and *directive*
> (target file/function/command). The "exactly five" rule was a design
> heuristic, not a principle — see Q1.
>
> **Verb count clarification**: Decree's **Standing Order** is a sub-mode
> of Decree (same composer + an interval picker), *not* a 7th verb.

| Verb | Maps to |
|---|---|
| **Dispatch a wielder** | spawn agent (claude/cursor/codex) with prompt |
| **Send word** | gentle follow-up prompt to a working agent (free-text only) |
| **⚜ Decree** | directive command — pick file / function / shell command, send as structured prompt. **Standing Order** sub-mode: same composer with an interval picker → recurring decree (cron-for-prompts). KH-flavored as a royal proclamation. |
| **Comfort** | restore HP/MP for a small munny cost |
| **Recall** | kill agent |
| **Seal the keyhole** | mark world done — manual seal button or session_end prompt |

**Decision moments** (small simulation layer that watches the event stream
for signals that *require* the player's attention):

- HP critical (< 25%) → modal: *Comfort Sora? (50µ)* or let them KO
- Stuck loop (3+ same tool with no progress) → *Send a Hint?* prompt
- Subagent timeout → *Recall or wait?*

These are what pulls a watcher back from passive to engaged. Without them,
it's a screensaver.

---

## State model — what maps to what

| Game element | Real thing |
|---|---|
| World | Repo (resolved by `.git/` ancestor walk) |
| Wielder | Agent session — identity = `(tool, repoRoot)` tuple |
| Wielder visual role | One of **4 keybladers**: Vaelen (purple, Guardian of Twilight) / Selene (pink, Dreamweaver) / Ryder (orange, Warden of Iron) / Lyris (cyan, Wanderer of the Sea). Hash-assigned per `(tool, repoRoot)`. |
| Heartless | Errors — Shadow / Soldier / Large Body, mix per-theme |
| Munny | Successful tool-call count × 5 |
| Drive Form | Tool-streak reward (transient flash — Valor / Wisdom / Final) |
| Focus | Steady gauge — visible on Throne Room card |
| Mood | `eager / focused / fatigued / desperate / triumphant / fallen / complete` — drives idle anim and Throne card display |
| Keyhole sealed | Manual seal button or session_end prompt → fanfare + permanent gold-keyhole on planet |
| Bond | Subagent parent-child relationship → tether visual, throne nesting, shared Focus regen, composite-form banners |
| Memory | Per-wielder persistent log: visit / seal / fall counts + lifetime munny |
| Renown | Derived stat (`visit + seal×3 − fall×2`), star-rank tiers New / Apprentice / Veteran / Hero |
| **Quest** | Per-prompt heroic-named task with summary on completion. Tracks duration / tokens / lines / subagents. Persisted indefinitely. (Phase 2A polish, deferred — see Backlog.) |
| **Standing Order** | Persisted recurring Decree (interval, prompt, optional max-iterations / cost cap). |

For exact TypeScript shapes (`UnitState`, `PersistedState`, etc.) see [`./architecture/state.md`](./architecture/state.md).

---

## Visual direction

Distinctive, atmospheric stylized 2D look. Painterly hi-res keybladers
+ 32×32 pixel-art Heartless + 64×64 pixel-art landmarks + iso ground
tiles. Per-world theme swap. Time-of-day cycle. Global filter pipeline
(CRT + bloom + vignette) ties the mixed resolutions together.

**Implementation diverged from Q15's locked plan.** Q15 said "true 32×32
pixel-art keybladers"; in practice the keybladers are hi-res painterly
(~290×200 per frame, 32-frame sheets), closer to the original Path B
recommendation. The Heartless and landmarks are 32×32 pixel-art as
specified. Q15 is treated as superseded by the actual shipped pipeline.

### Tier 1 — Atmosphere (always-on)

CRT scanline + curvature, bloom, vignette, per-scene color grade.
Gradient sky, parallax layers, particle drift, time-of-day overlay.
Per-theme swap (sky color / particle color / color grade LUT /
signature decoration).

### Tier 2 — Per-world atmospherics

Water for Destiny Islands, fire for Halloween Town, magic energy for
drives + casts.

### Tier 3 — Event pulses

Heat haze (seal fanfare, summons), chromatic aberration (KO,
critical HP pulse), barrel-pinch spike on KO, golden bloom flare on
keyhole seal.

### Sprite paths

- **Keybladers**: painterly hi-res pixel-art at ~290×200/frame, 32-frame
  sheets (idle × 3 facings, walk × 3 facings, attack, cast). Sourced via
  AI generation + concept-art extraction pipeline.
- **Heartless**: 32×32 pixel-art per Path A. 8-frame sheets (idle bob,
  swing/lunge).
- **Landmarks**: 64×64 pixel-art per Path A. One per theme.
- **Tiles**: iso diamond pixel-art per Path A.

---

## Build phases (framework)

The project shipped in coherent phases. Vision describes the **shape** of
each phase; CHANGELOG records what landed in each.

- **MVP** (P1–P10) — rename, Phaser 4 visual pipeline, atmosphere pass,
  pixel-art sprites, Throne Room overlay, persistent state JSON, letter
  feed + decision moments, 5 v1 verbs, session-end seal flow.
  **Shipped in [v0.1.0](../CHANGELOG.md#010--2026-04-28--mvp-shipped).**
- **Q40 unified Star Chart** — replace the 3-scene drill-down with a
  single pan/zoom canvas. Architectural pivot. Shipped with MVP.
- **Phase 2B — attention-direction + in-context observability** —
  9 in-scope items (priority queue, observability layers, Decree composer,
  Standing Orders, voice, notifications, permission approval surface).
  **Shipped in [v0.1.0](../CHANGELOG.md#010--2026-04-28--mvp-shipped) and
  [v0.2.0](../CHANGELOG.md#020--2026-04-29--hud-redesign-polish-multi-tool-hook-installers).**
- **Phase 2A polish — visual & audio** — Tier 2/3 shaders, chiptune
  music, decorations, banners, MP weighting, Renown UI. Locked but
  partially shipped; remaining items in [Backlog](#backlog).
- **HUD redesign** — four-corner FFXIV-style HUD + floating panel
  system. Subsequent pass on top of MVP.
  **Shipped in [v0.2.0](../CHANGELOG.md#020--2026-04-29--hud-redesign-polish-multi-tool-hook-installers).**
- **Multi-tool hook landing** — Cursor + Codex hook installers, bridge
  dispatcher, transcript watchers, per-tool permission flow.
  **Shipped in [v0.2.0](../CHANGELOG.md#020--2026-04-29--hud-redesign-polish-multi-tool-hook-installers)
  and polished in [v0.3.0](../CHANGELOG.md#030--2026-04-30--multi-tool-hook-landing-polish--handbook).**

---

## Locked decisions (Q1–Q27)

Frozen reference. Grouped by topic. The decision text is the authoritative
record — implementation may diverge (and where it does, the decision is
flagged as superseded with a pointer).

### Direction & framing

1. **Sims-KH or something else?** — **Sims-KH locked for v1; expanded
   for Phase 2B.** Player nudges autonomous wielders. Original v1 verbs
   were strictly gentle (suggest, comfort, dispatch). Updated 2026-04-28:
   real workflow has a directive component (target files/functions/
   commands) that the gentle-only verb set under-served. Phase 2B adds
   **Decree** as a sixth verb — kept visually distinct from gentle verbs
   (gold sigil, formal framing). Still not tick-by-tick RTS commanding;
   closer to a King issuing formal proclamations.
2. **Name?** — **`keykeeper` locked.** Renames `package.json` "name",
   user-data path, README copy. Repo directory name is the user's call —
   can stay `kh-rts` on disk.
3. **Audience?** — **Hybrid (private but tidy) locked.** Built for
   personal use, but commit cleanly with an honest README. macOS-first,
   no cross-platform investment, no elaborate onboarding. Re-opened by
   Q28 (2026-04-28) which reaffirmed strictly personal-tidy.

### Throne Room

4. **Cinematic vs HUD-y?** — **Original v1 lock superseded by Q40.**
   Throne becomes a **side overlay panel** alongside the unified Star
   Chart map (Q40.1=a). The Phaser ambient ThroneScene becomes obsolete
   (no separate Throne canvas). React side panel + Phaser unified map
   share the Zustand store.
5. **Default scene on app open** — **Superseded by Q40.** Original v1
   design (3-scene Throne / Gummi / Arena with cinematic dive) replaced
   with a single pan/zoom unified-map. See Q40.
6. **Letter feed** — **Locked.** Three tiers:
   - **Critical** (red, pulses throne attention indicator): error, HP <
     25%, world fallen
   - **Important** (gold, no pulse): session_end, world cleared, world →
     danger, subagent_spawn
   - **Notable** (cyan, only if no critical/important in last 60s):
     drive activated, session_start, stuck-loop detected (offers "Send a
     Hint?")
   - Background events (tool_use / result / assistant_text / user_prompt)
     never become letters; they live in the chat panel.
   - **Rate limit**: 6 letters per wielder per minute. Identical-kind
     letters within 30s collapse into one with a count badge.
   - **Expiry**: 5 min auto-fade to a collapsed archive, or explicit
     dismiss.
   - **Click action**: opens the relevant world (cinematic dive) and
     centers on the affected wielder.
7. **Quick-act buttons** — **Hybrid C locked.** Verbs live next to
   their targets:
   - Top of Throne Room: **Dispatch** (kingdom-wide spawn — opens
     world/tool/role picker)
   - Per-wielder card: **Send word**, **♥ Comfort**, **× Recall**
   - Per-world (in throne, gummi map, world arena header): **Seal**
     verb when the world is eligible.
   The card layout is its own command panel — actions sit where you're
   already looking. No modal-soup of "pick a wielder, pick an action".

### Player verbs

8. **Comfort cost & cooldown** — **Defaults locked.** 50µ per use,
   +30 HP, 30s cooldown per wielder. Available when HP < 100 and status
   ≠ fallen. KH Cure chime + small green bell + sparkles visual.
   Cura/Curaga tiers deferred to polish phase.
9. **Seal the keyhole trigger** — **Locked. No git/PR auto-detection.**
   The King decides. Flow:
   - **session_end (HP > 0)**: Important letter — *"Sora finished session
     in kh-rts. Plan complete?"* with `[✦ Seal keyhole]` and `[↻ Iterate]`.
     Seal → cinematic fanfare + permanent gold keyhole. Iterate → opens
     "Send word" modal pre-filled with a clarification template.
   - **session_end (HP = 0)**: Critical letter — *"Sora fell in kh-rts.
     World needs help."* with `[Dispatch new wielder]` and `[Dismiss]`.
     World stays unsealed + visibly fallen on gummi map.
   - **Per-world Seal button** always available as manual fallback.
   - **Visual**: KH light beam + gold keyhole materialization + chime.
10. **Decision moment thresholds** — **Locked starter values.** Easy to
    tune later by feel.
    - HP < 25% → Critical letter, suggests Comfort
    - Stuck loop (same tool name + same input args 3+ times in 60s, OR
      3+ tool_results with no assistant_text between) → Notable letter
      *"Send a Hint?"* with Send word action
    - Subagent quiet > 5 min → Important letter `[Recall] [Wait]`
    - World alert → danger transition → Important letter (one-shot)
    - Drive activated → Notable letter (info, no action needed)

### State & persistence

11. **Where does persistent state live?** — **JSON file locked.** Path:
    `~/.keykeeper/state.json`. Read on
    startup, debounced writes (200ms after last change). SQLite reserved
    for if/when we add replay or leaderboards.
12. **What persists across sessions?** — **Locked.**
    - **Wielder identity** = `(tool, cwd-resolved-to-repo-root)` tuple.
    - **Per wielder**: visit count, seal count, fall count, total munny
      earned, last seen
    - **Per world**: sealed state, total seals, last visit, total
      clears, total falls
    - **Kingdom-wide**: total munny vault (lifetime), sealed-worlds
      count, kingdom founded timestamp
    - **Mute list** stays in localStorage (renderer-only)
    - **Not persisted**: live HP / MP / Focus, active sessions, live
      heartless, active letters, selection
    - **Renown stat** (derived from persisted fields).
    - **Reset path**: a "Reset Kingdom" verb in settings, or `rm
      ~/.keykeeper/state.json`.

    > **Phase 2B addition**: **Quests** persist indefinitely as a per-
    > `(tool, repoRoot)` array of records. Cap at e.g. 200 most-recent
    > per wielder. **Standing Orders** persist as `{orderId, wielderId,
    > prompt, intervalMs, maxIterations?, maxTokens?, iterationsRun,
    > status}`.
13. **Bonds** — **Yes for v1, but scoped to subagent relationships
    only.** Independent peer wielders in the same repo don't bond.
    Subagent spawn = automatic bond. Visualized as nested cards, tether
    line, mutual buff (shared Focus regen), composite forms when ≥1
    child alive (1 = Pair, 2 = Royal Guard, 3 = Wayfinder Trio).
14. **Time-of-day cycle in arena** — **Yes, in v1.** Cosmetic overlay
    tinted by session age:
    - 0–3 min: bright daylight, cool blue tint
    - 3–10 min: warm afternoon, amber
    - 10–20 min: sunset orange, long shadows
    - 20+ min: dusk/night, lamp posts brighter, drive auras pop more

### Visuals

15. **Sprite path** — **A (pixel art) locked → SUPERSEDED in
    practice.** Original lock: true 32×32 pixel-art keybladers. Actual
    implementation diverged: keybladers are hi-res painterly pixel-art
    sourced via AI-generation + concept-art extraction. Heartless,
    landmarks, and iso tiles followed Path A. Treat Q15 as historical
    context.
16. **Atmosphere pass first?** — **Yes, locked.** Path-agnostic visual
    lift validates the technique before investing in pixel art.
17. **Custom shader budget** — **All 9 shaders locked, tiered.** Tier
    1 global pass (CRT scanline + curvature, bloom, vignette, color
    grade); Tier 2 per-scene contextual (water, fire, magic); Tier 3
    event-driven moments (displacement / heat haze, chromatic
    aberration). Tier 1 is non-negotiable for path A's look.
18. **Per-world arena theming** — **Hybrid C locked.** Shared arena
    *system* (same iso grid, same combat, same base layout). Theme
    controls swap: sky color, ambient particle color, color grade LUT,
    1–2 signature decorations.

### Audio

19. **Music style** — **Chiptune via Web Audio synth locked.** Pairs
    with path A pixel art (KH:CoM GBA precedent). Ambient-leaning,
    sparse phrases. Default volume 30% for ambient, mutable via 🔊
    toggle.
20. **SFX** — **Web Audio synth locked, library expanded.** Cohesive
    with chiptune music. Sample-based SFX deferred indefinitely (would
    fight the chiptune identity).

### Scope & shipping

21. **MVP definition** — **Locked.** P1–P10 as the work-unit
    breakdown. See [Build phases](#build-phases-framework).
22. **First public ship** — Honest README. No screenshots / GIF
    promotion expected pre-Phase 2B.
23. **Replay mode** — Phase 2A polish (deferred — see Backlog).
24. **Outbound MCP** — Phase 2A polish (deferred — see Backlog).

### Engineering

25. **Renderer / process model** — No change. Throne Room is React/
    HTML, gummi + arena are Phaser canvas. Already mixed cleanly via
    App.tsx.
26. **Phaser 4 filter pipeline** — Will validate as the first task of
    the atmosphere pass.
27. **Test fixtures** — Add as needed during build. Specifically for
    MVP: HP-critical, stuck-loop, subagent timeout, long-session for
    time-of-day verification.

---

## Open questions (Q28–Q44)

All decided as of 2026-04-28. Listed here as decision history; future
open questions go below.

28. **Audience trajectory revisit?** — **(a) strictly personal-tidy
    locked.** Reaffirms Q3 with full Phase 2B scope in mind. Cascading
    consequences: Q31 narrows to single-tenant; Q33–Q35 deferred
    indefinitely; Q29 tunnel-only.
29. **Mobile companion (PWA)?** — **Deferred.** Today's pain is
    desktop attention-direction. Revive when an AFK / on-the-go use
    case emerges.
30. **Notifications scope?** — **(d) all four triggers locked**:
    Critical letters + permission requests + Important letters + plan
    approvals. Per-trigger toggle in settings. Quiet hours 22:00–08:00.
    Desktop OS notifications (not Web Push).
31. **Relay platform?** — **Deferred.** Build only if desktop
    notifications + in-app priority queue prove insufficient. When/if
    revived, Discord or Slack (not Telegram). Single-tenant per Q28=a.
32. **Permission approval depth?** — **(b) locked.** yes / no / once
    buttons on the letter, **plus** the command + Claude's reasoning +
    risk-level chip. "Approve y/n KNOWING this." Default-deny on
    timeout.
33. **Shared kingdoms — depth?** — **Deferred indefinitely** per Q28=a.
34. **Shared kingdoms — identity & sync?** — **Deferred per Q28=a.**
35. **Composite forms across teams?** — **Deferred per Q28=a.**
    Cross-team composite forms require shared kingdoms first. Same-King
    composite forms (parent-subagent) ship as part of Phase 2A.
36. **Quest system — naming model?** — **(a) Anthropic API locked**,
    architected via the **Vercel AI SDK** as a provider-agnostic
    abstraction. Quest naming lives in `src/main/quest-namer.ts` with
    one function: `nameQuest(prompt, eventLog) → { name, recap }`.
    User provides Anthropic API key in keykeeper settings; if missing,
    fall back to raw-prompt-as-name. ~½¢/quest.
37. **Standing Order — guardrails?** — **Locked.**
    - **Max iterations**: hard cap, default 24, overridable per Order.
    - **Stop-on-failures**: pause after **3 consecutive failures**.
    - **Cost cap**: skip for v1.
    - **Visibility**: recurring-clock badge; confirm dialog required
      before starting.
38. **Voice input scope?** — **(a) transcription-only locked.** Voice
    commands deferred — mishearing causes destructive actions.
39. **Decree composer UX?** — **(b) layered composer locked.** Free-text
    primary; `@` opens file palette, `/` opens command palette. Decree
    owns its own composer distinct from Send word.
40. **Unified-map architecture (replaces 3-scene drill-down)** —
    **Locked 2026-04-28.** Replace Throne / Gummi / Arena tabs with a
    single pan/zoom canvas (the "Star Chart").

    **Sub-decisions:**
    - **Q41 Throne Room fate = (a) side overlay panel.**
    - **Q42 Camera behavior = (a) strict manual + click-to-pan.**
      Camera *only* moves on explicit user actions.
    - **Q43 Map layout = (c) constellation/clustering.** Worlds cluster
      by shared git remote host or shared parent path on disk.
    - **Q44 Zoom-out world rendering = (b) single iso miniature.** Same
      iso plane rendering at all zoom levels — camera scales it.
      Wielders appear as dots at zoom-out, full painterly sprites at
      zoom-in.

41. **Q40.1 Throne Room fate** — locked (a) side overlay. See Q40.
42. **Q40.2 Camera behavior** — locked (a) strict manual + card-click
    pan. See Q40.
43. **Q40.3 Map layout** — locked (c) constellation/clustering. See Q40.
44. **Q40.4 Zoom-out world rendering** — locked (b) single iso
    miniature scaled by camera. See Q40.

---

## Backlog

Items deferred but on the radar. Not "killed" — revive when their
trigger condition shows up. Order is rough priority (highest first).

### Active workstream — see plans/

- **Drive observed wielders via session resume** — full plan in
  [`./plans/observed-resume.md`](./plans/observed-resume.md). Empirically
  verified for all 3 tools 2026-04-30; implementation pending.
- **Provider-neutral multi-choice permissions** — full plan in
  [`./plans/multi-choice-permissions.md`](./plans/multi-choice-permissions.md).
  Needed for confirmation prompts that expose multiple selectable options
  instead of a single allow/deny pair.

### Phase 2A polish (deferred)

- **Quest system** (~1.5d) — auto-thematic per-prompt quests with
  AI-generated names + recaps via Vercel AI SDK abstraction, persisted
  indefinitely, surfaced as Quest Log + per-card active/last-quest,
  feeds Renown stat. See Q36.
- **Cura / Curaga** tier verbs — heal-many variants of Comfort.
- **Replay mode** (event-log scrubber) — record event JSONL → playback.
- **Outbound MCP server** — expose kingdom as MCP tools so other AI
  agents can read the world or spawn units.

### Phase 2B (deferred — revive when trigger fires)

- **#16 Mobile companion (PWA)** — revive when an AFK / on-the-go use
  case emerges. Q29.
- **#19 Discord/Slack relay** — revive if desktop notifications +
  in-app priority queue prove insufficient. Q31.
- **#20 Shared kingdoms** — deferred indefinitely per Q28=a (strictly
  personal-tidy). Q33–Q35.

### Post-MVP polish surface

- **HUD layout edit-mode** (FF14 drag-to-reposition) — let the King
  rearrange the four-corner HUD widgets.
- **Minimap of star chart** — picture-in-picture overview at all zoom
  levels.
- **Under-attack kingdom alert** — kingdom-wide critical state badge in
  the KingdomHeader pill.
- **Threat list** — sortable list of active issues across worlds.
- **Floating-text damage numbers** on canvas — combat juice.

### Renderer hardening (deferred — see Known gaps)

- `sandbox: true` for renderer (~½ day, before public distribution)
- Per-handler IPC payload schemas (~1–2h, defensive)
- Renderer bundle size code-splitting (Shiki/Mermaid/KaTeX, P3)

---

## Known gaps

Forward-looking technical work. Each is either deferred deliberately or
a known protocol-level constraint we can't fix on our side.

### Renderer hardening (P1, partial)

The renderer drives high-impact APIs (spawn agents, install hooks,
modify settings, resolve permissions). Today's hardening:

- `will-navigate` + `setWindowOpenHandler` so external URLs open in
  the OS browser, never inside the keykeeper renderer
- A `safeHandle` wrapper around every `ipcMain.handle` call that
  rejects requests originating from any frame other than our main
  window's top-level frame

Still missing:

- **`sandbox: true` for the renderer** — currently the preload uses
  `require()` to import shared types and `electron`. Switching on
  sandbox would force the preload into a self-contained bundle with
  only the `electron` whitelist available. Real refactor (~half day);
  worth doing before any public distribution.
- **Per-handler IPC payload schemas** — `safeHandle` validates
  *origin*, not *shape*. A buggy renderer could still send an unsafe
  payload to e.g. `IPC.SaveSettings`. Wrap each handler with a zod
  (or hand-rolled) schema (~1–2 hours total). Defensive, not
  load-bearing today.

### Renderer bundle size (P3)

`ConversationStream` statically imports the full Streamdown stack —
every Shiki language, the entire Mermaid engine, KaTeX, CJK fonts.
Builds to a ~10 MB renderer chunk loaded at startup. On a desktop
Electron app this is invisible to the user (no network round-trip)
but degrades cold-start time and memory. Two staged fixes:

- (a) Configure Shiki with a small language whitelist (TS/JS/Python/
  Bash/JSON/Markdown) — chops a few MB.
- (b) Dynamic-import Mermaid + math only when expanding a log entry
  that contains those — biggest win.

Not urgent. Wait until cold-start time becomes annoying.

### Hook-observed sessions can't be controlled

Today, send-word / recall / dispatch only work for sessions keykeeper
spawned itself (`AgentManager.spawn` registers the proc). Hook-observed
wielders (Claude/Cursor/Codex sessions started outside keykeeper) show
up in the party list with full event history but the control verbs are
no-ops — there's no proc handle to send into.

**This is being addressed** — see [`./plans/observed-resume.md`](./plans/observed-resume.md).
Resume mechanics empirically verified for all three tools 2026-04-30.

### Codex desktop-app version drift (informational)

The Codex desktop app uses its own bundled `codex` binary at
`/Applications/Codex.app/Contents/Resources/codex`, separately versioned
from the system `codex` CLI on `PATH`. Both load `~/.codex/config.toml`
the same way (verified empirically), but this is undocumented — Codex
hooks are stable in the JSON schema and Rust source but not yet in the
public docs. Worth re-verifying on each Codex update that the hook
contract hasn't changed.

### Codex hooks: known constraints (vs. Claude)

Codex's `PermissionRequest` hook is hook-or-bust: if the hook returns
allow/deny, Codex commits and never shows its native UI. Different from
Claude (concurrent UI race) and Cursor (one-shot too, but allow is
advisory). This is a deliberate design choice in Codex's orchestrator
(`codex-rs/core/src/tools/orchestrator.rs`); we cannot replicate
Claude's race semantics from outside without an upstream change. Three
possible upstream fixes Codex could ship: (a) flip to concurrent UI +
hook race, (b) provide a side-channel to inject decisions after the
hook returns "no verdict", or (c) add an "ask" decision like Cursor's.
Worth filing as a feature request.

Also: Codex doesn't support `async = true` in hook entries yet (it
warns "skipping async hook in ~/.codex/config.toml" and silently drops
them). Our installer always emits sync entries to work around this; if
Codex adds async support later, switching observability hooks to
async would be a small perf win.

### Cursor `--print --resume` strips most hooks

Cursor's `cursor-agent --print --resume <chatId>` mode only fires
`sessionEnd` — no `beforeSubmitPrompt`, no `afterAgentResponse`, no
`preToolUse`/`postToolUse`. The conversation lands correctly in the
chat database but keykeeper sees nothing of the live event stream.

Workaround in [`./plans/observed-resume.md`](./plans/observed-resume.md):
capture the assistant reply on stdout from `--print`, synthesize
`user_prompt` + `assistant_text` events ourselves, inject into the
bus. Tool calls during the reply remain invisible.
