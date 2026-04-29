# keykeeper — Vision & Open Questions

Supersedes `roadmap.md` (which is stale — references Phaser 3, "RTS" framing,
and pre-multi-tool design). Keep `roadmap.md` for historical context only.

> Repo dir on disk is still `kh-rts/` — npm package is `keykeeper`.

## Table of contents

- [TL;DR](#tldr)
- [Status snapshot](#status-snapshot) — what's shipped, what's in flight
- [What this is (and isn't)](#what-this-is-and-isnt)
- [Non-goals](#non-goals) — explicit out-of-scope
- [Core loop](#core-loop)
- [Scenes](#scenes)
- [Player verbs (six)](#player-verbs-six--formerly-five)
- [State model](#state-model--what-maps-to-what)
- [Visual direction](#visual-direction)
- [Build phases](#build-phases) — MVP ✅ shipped · Phase 2A polish · Phase 2B directions
- [Locked decisions](#locked-decisions-q1q27) (Q1–Q27, frozen reference)
- [Open questions](#open-questions-q28q44-live-work) (Q28–Q44, live work)
- [Existing work that survives the redesign](#existing-work-that-survives-the-redesign)

---

## TL;DR

**keykeeper is a Kingdom-Hearts-themed *agent watch room* — a Sims-style
spectator strategy app where the player is the King at Disney Castle, their
keyblade wielders (Claude / Cursor / Codex sessions) are out clearing worlds
(repos), and the player nudges, dispatches, and witnesses rather than
commanding tick-by-tick.**

Real agent activity drives autonomous Sim behavior. v1 verbs were strictly
gentle (Dispatch, Send word, Comfort, Recall, Seal). Phase 2B adds a
sixth — **Decree** (directive: target file/function/command) — kept
visually distinct so the spectator-strategy tone holds while the directive
flow is first-class. The visual goal is a distinctive, atmospheric stylized
2D look (currently: hi-res painterly pixel-art keybladers on a 2D iso plane,
with CRT + bloom + vignette filter pipeline).

---

## Status snapshot

**MVP shipped (P1–P10, ✅ all complete as of 2026-04-28):** rename to
keykeeper, Phaser 4 filter pipeline, atmosphere pass on all scenes,
pixel-art sprites (4 keybladers + 3 Heartless types + 6 themed
landmarks + iso tiles), Throne Room (React overlay; Phaser ambient
backdrop deferred — see Q4 footnote), persistent state JSON, letter
feed + decision-moment generators, 5 v1 verbs wired (Dispatch / Send
word / Comfort / Recall / Seal), session-end seal flow, README + first
commit pending (working tree has the changes uncommitted at audit time).

**Recent polish (2026-04-28):** Throne portrait wiring, sprite scale
bump (0.47 → 0.7), CSS atmosphere upgrade (gold-red banner streaks,
particle dust, edge vignette), kh→kh-default sprite move (canonical
art now ships with repo), override-probe with content-type check (Vite
SPA-fallback gotcha).

**Phase 2B planning ✅ mostly complete (2026-04-28):** Q28–Q44
locked. **Q40 (unified-map architecture) added late same day** —
direction locked, sub-questions Q41–Q44 in flight. Replaces the
3-scene Throne / Gummi / Arena drill-down with a single pan/zoom
canvas.

**In flight:**
- **Architecture redesign (Q40)** — unified pan/zoom map. ~1–2 day
  refactor before items #11/#12 land on the new foundation.
- Building scene-agnostic items (#15 voice, #17 desktop notifs, #14
  Decree composer, #18 permission) can start in parallel.

**Phase 2A polish (decisions locked, not yet started):** Tier 2/3
shaders, chiptune music, Renown UI, replay mode, outbound MCP. See
[Build phases](#build-phases).

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
- **Mobile companion / PWA** — killed per Q29 (2026-04-28). Real pain
  is desktop attention-direction with multiple parallel agents, not
  AFK monitoring. Notifications stay (as desktop OS notifications,
  not Web Push). Revive only if an actual AFK use case emerges.
- **Tick-by-tick RTS commanding** — the agents have their own minds; the
  player nudges and decrees, never micromanages.
- **AgentCraft's "Alliance Hall" multi-King co-op rooms** — solo
  workflow today; shared kingdoms (Phase 2B #20) is deferred until a
  real teammate use case emerges.
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

### 1. Throne Room (✅ shipped — home view)

The default home. Optimized for **glanceability**, not motion. Replaces
"always-on Gummi Map" as the home screen.

- **Wielder card grid**: each active session as a portrait card with HP /
  MP / Focus bars, mood icon, current world, last activity stamp
- **Letter feed**: ranked event stream — errors, session_end, decision
  prompts. Severity-colored (Critical / Important / Notable per Q6)
- **King's verb stamps**: 6 buttons (see verbs below — Decree is
  Phase 2B; v1 ships with 5)
- **Munny vault counter**: kingdom-wide total
- **Sealed worlds tally**: roster of cleared keyholes
- **Background**: hybrid React overlay + Phaser ambient backdrop (Q4
  ✅ Hybrid). v1 ships with the React layer + a CSS-enriched backdrop
  (gold-red banner streaks, particle dust, vignetted edges); the full
  Phaser ambient `ThroneScene` (animated castle hall, light beams,
  drifting dust) is deferred to Phase 2A.

### 2. Gummi Map (✅ shipped — navigator)

Demoted from "home" to "navigator". Still useful when you want spatial
overview. Themed planets, alert states, dive-in.
- 6 themed worlds (Disney Castle, Hollow Bastion, Traverse Town, Destiny
  Islands, Twilight Town, Halloween Town), assigned by hash of repo root
- Alert pulse colors per state
- Heartless count badge, cleared-world gold star
- Atmosphere pass: starfield, parallax, vignette

### 3. World Arena (✅ shipped — cinematic dive)

The cinematic dive — slowest, most KH-flavored scene. Where ambient patrol
+ Heartless combat + drives live. Intentionally **not** where the player
spends most of their time.

- Isometric grid + 6 themed landmarks (Disney / Hollow Bastion /
  Traverse / Destiny Islands / Twilight / Halloween — pixel art at
  64×64)
- **4 keybladers** (Vaelen / Selene / Ryder / Lyris — see § State
  model) at hi-res painterly pixel art. Note: Q15 originally locked
  "true 32×32 pixel-art"; implementation diverged toward painterly
  hi-res (~290×200/frame, 32-frame sheets). Q15 is effectively
  superseded by the actual asset pipeline; see Q15 footnote.
- 3 Heartless types (Shadow / Soldier / Large Body) at 32×32 pixel art
- Pixel-art iso ground tiles
- Heartless combat (errors spawn, edits clear)
- Drive forms (Valor / Wisdom / Final) with auras + activation flash
- Victory + KO poses on session_end / HP=0
- Patrol-based idle behavior (units wander between landmarks)
- Munny counter, tool pills (Claude / Cursor / Codex color-coded)
- Per-world theming: sky color, ambient particles, color grade,
  signature decoration
- Time-of-day cycle (overlay tinted by session age)

---

## Player verbs (six — formerly five)

> Originally locked at "exactly five gentle verbs" in the v1 design. The
> sixth verb (**Decree**) was added 2026-04-28 after surfacing a real
> workflow split between *gentle* (check-in, comfort) and *directive*
> (target file/function/command). The "exactly five" rule was a design
> heuristic, not a principle — see Q1 update in [Locked decisions](#locked-decisions-q1q27).
>
> **Verb count clarification**: Decree's **Standing Order** is a sub-mode
> of Decree (same composer + an interval picker), *not* a 7th verb.
> Verb count stays at six.

| Verb | Maps to | Status |
|---|---|---|
| **Dispatch a wielder** | spawn agent (claude/cursor/codex) with prompt | ✅ shipped |
| **Send word** | gentle follow-up prompt to a working agent (free-text only) | ✅ shipped |
| **⚜ Decree** | directive command — pick file / function / shell command, send as structured prompt. **Standing Order** sub-mode: same composer with an interval picker → recurring decree (cron-for-prompts). KH-flavored as a royal proclamation. | ❌ Phase 2B (#14) |
| **Comfort** | restore HP/MP for a small munny cost | ✅ shipped |
| **Recall** | kill agent | ✅ shipped |
| **Seal the keyhole** | mark world done — manual seal button or session_end prompt | ✅ shipped |

**Decision moments** (small simulation layer that watches the event stream
for signals that *require* the player's attention):

- HP critical (< 25%) → modal: *Comfort Sora? (50µ)* or let them KO
- Stuck loop (3+ same tool with no progress) → *Send a Hint?* prompt
- Subagent timeout → *Recall or wait?*

These are what pulls a watcher back from passive to engaged. Without them,
it's a screensaver.

---

## State model — what maps to what

| Game element | Real thing | Status |
|---|---|---|
| World | Repo (resolved by `.git/` ancestor walk) | ✅ shipped |
| Wielder | Agent session — identity = `(tool, repoRoot)` tuple | ✅ shipped |
| Wielder visual role | One of **4 keybladers**: Vaelen (purple, Guardian of Twilight) / Selene (pink, Dreamweaver) / Ryder (orange, Warden of Iron) / Lyris (cyan, Wanderer of the Sea). Hash-assigned per `(tool, repoRoot)`. | ✅ shipped |
| Heartless | Errors — Shadow / Soldier / Large Body, mix per-theme | ✅ shipped |
| Munny | Successful tool-call count × 5 | ✅ shipped |
| Drive Form | Tool-streak reward (transient flash — Valor / Wisdom / Final) | ✅ shipped |
| Focus | Steady gauge — visible on Throne Room card (currently 35% / 100% based on drive state) | ✅ shipped (basic) |
| Mood | `eager / focused / fatigued / desperate / triumphant / fallen / complete` — drives idle anim and Throne card display | ✅ shipped |
| Keyhole sealed | Manual seal button or session_end prompt → fanfare + permanent gold-keyhole on planet | ✅ shipped |
| Bond | Subagent parent-child relationship → tether visual, throne nesting, shared Focus regen, composite-form banners | ✅ partial (tether shipped; throne nesting + composite banners deferred to Phase 2A #5) |
| Heart | Long-term mood — accumulates from clears, drains from KOs | ❌ designed, not built (Phase 2A) |
| Memory | Per-wielder persistent log: visit / seal / fall counts (basic), full event-log replay (advanced) | ✅ basic (Q12); advanced replay = Phase 2A #9 |
| Renown | Derived stat (`visit + seal×3 − fall×2`), star-rank tiers New / Apprentice / Veteran / Hero | ✅ persisted; ❌ UI deferred (Phase 2A #7) |
| **Quest** *(NEW Phase 2B)* | Per-prompt heroic-named task with summary on completion. Tracks duration / tokens / lines / subagents. Persisted indefinitely. | ❌ Phase 2B (#12) |
| **Standing Order** *(NEW Phase 2B)* | Persisted recurring Decree (interval, prompt, optional max-iterations / cost cap). | ❌ Phase 2B (#14 sub-mode) |

---

## Visual direction

**Status**: ✅ shipped for v1. Atmosphere pass (Tier 1 shaders + gradient
sky + parallax + particle drift) runs on every scene. Painterly hi-res
keybladers + 32×32 pixel-art Heartless + 64×64 pixel-art landmarks +
iso ground tiles. Per-world theme swap works. Time-of-day cycle wired.

**Implementation diverged from Q15's locked plan.** Q15 said "true 32×32
pixel-art keybladers"; in practice the keybladers are hi-res painterly
(~290×200 per frame, 32-frame sheets), closer to the original Path B
recommendation. The Heartless and landmarks are 32×32 pixel-art as
specified. The mixed-resolution approach works because the global CRT +
bloom + vignette stack ties everything together visually. Q15 is
treated as superseded by the actual shipped pipeline.

### Phase 1: Atmosphere pass — ✅ shipped (P3, P5)

Tier 1 shaders globally: CRT scanline + curvature, bloom, vignette,
per-scene color grade. Gradient sky, parallax layers, particle drift,
time-of-day overlay. Per-theme swap (sky color / particle color / color
grade LUT / signature decoration).

### Phase 2: Sprite direction — ✅ shipped, divergent from original plan

Original options were Path A (32×32 hand-keyed pixel art), Path B
(painterly silhouette), Path C (parchment war-room). Q15 locked Path A;
implementation became a Path A/B hybrid:

- **Keybladers**: painterly hi-res pixel-art at ~290×200/frame, 32-frame
  sheets (idle × 3 facings, walk × 3 facings, attack, cast). Sourced via
  AI generation + concept-art extraction pipeline.
- **Heartless**: 32×32 pixel-art per Path A. 8-frame sheets (idle bob,
  swing/lunge).
- **Landmarks**: 64×64 pixel-art per Path A. One per theme.
- **Tiles**: iso diamond pixel-art per Path A.

Tying filter: CRT scanline + bloom + vignette stack on every scene.

---

## Build phases

MVP **shipped 2026-04-28** (~7 days of focused work). Each phase was a
coherent ship-able unit. Status check: README mirrors the P1–P10 ✅ list
in Status snapshot above.

### MVP — ✅ shipped

**P1. Rename to keykeeper** (~30 min) ✅
- `package.json` name field
- README (when written)
- User-data path migrates implicitly via Electron's `app.getPath`
- Repo directory name on disk is the user's call

**P2. Phaser 4 filter validation** (30 min, blocking gate) ✅
- Confirm Phaser 4 filter pipeline works in this Electron setup
- One throwaway test scene with bloom + vignette
- If broken, fall back to CSS/SVG filter approach

**P3. Atmosphere pass on Gummi Map** (~1d) ✅
- Tier 1 shaders globally: CRT scanline + curvature, bloom, vignette,
  per-scene color grade
- Gradient sky, parallax star/nebula layers, particle drift
- Validate visual lift before continuing

**P4. Pixel art sprite generator v2** (~1.5d) ✅ (diverged to painterly hi-res keybladers; see Visual direction)
- Rewrite `scripts/generate-sprites.ts` for 32×32 pixel-art output
- 6–8 color palette per character, no anti-aliasing
- 4-direction × 4-frame walk cycles + idle + swing/cast frames
- 64×64 pixel-art landmarks (Disney Castle, Hollow Bastion, Traverse
  Town + 3 new for the new themes)
- Pixel-art Heartless: Shadow + Soldier + Large Body
- Pixel-art iso ground tiles
- Integer-scaling render setup in Phaser

**P5. Atmosphere pass on World Arena** (~½d) ✅
- Same Tier 1 stack tuned for arena
- Time-of-day cycle (overlay tinted by session age)
- Per-world atmosphere swap (sky / particles / color grade) via theme
- 1 signature decoration per theme (replaces base landmark)

**P6. Throne Room scene** (~1.5d) ✅ (CSS-enriched backdrop ships; full Phaser ambient `ThroneScene` deferred to Phase 2A)
- New `ThroneScene` (Phaser ambient castle backdrop, banners, light
  beams, particle dust — no game logic)
- New `ThroneRoom.tsx` React overlay with:
  - Wielder cards (portrait + HP/MP/Focus + mood + current world +
    per-card Send word / Comfort / Recall buttons)
  - Letter feed (severity-tiered, 5 min auto-archive, click → dive)
  - Top-level Dispatch button
  - Munny vault counter
  - Sealed-worlds tally
- Subagent bond visuals: child cards nested under parent + tether line
- Top tabs: `Throne | Gummi Map | <active world>`. Default = Throne.

**P7. Persistent state JSON** (~½d) ✅
- `~/Library/Application Support/keykeeper/state.json`
- Wielder identity = `(tool, repoRoot)` tuple
- Persisted: visit / seal / fall counts per wielder, sealed state per
  world, lifetime munny, kingdom-founded timestamp
- Debounced 200ms writes
- Reset path: settings verb or manual `rm`

**P8. Decision-moment letters + verbs** (~1d) ✅
- Simulation layer: HP < 25%, stuck-loop (3+ same tool / 60s), subagent
  > 5 min, world → danger transition, drive activated
- Letter generation tied to thresholds, with rate-limit + collapse
- **Comfort verb**: 50µ for +30 HP, 30s cooldown per wielder, KH Cure
  chime + green sparkle visual
- **Seal flow**: session_end (HP > 0) → `[Seal] [Iterate]` letter; HP=0
  → `[Dispatch new] [Dismiss]` letter
- **Iterate** opens Send word modal pre-filled with template

**P9. Cinematic dive + seal fanfare** (~½d) ✅
- Dive transition: Throne → Gummi Map flight (1.5s) → World Arena
- Seal fanfare: pull camera to Gummi Map, light beam, gold keyhole
  materializes, KH chime, permanent gold-keyhole on planet
- KO transition: arena darken + chromatic aberration sting (Tier 3
  shader, scoped to this moment)
- Skip with Shift / Esc

**P10. README + first commit** (~½d) ✅ README · ⏳ first commit pending (working tree carries P1–P10 + recent polish)
- Honest README: what it is, install, drop-zones, troubleshooting
- First git commit (repo still uncommitted at audit time — see Status snapshot)

### Post-v1 polish — Phase 2A (visual & audio, decisions locked)

1. Tier 2 shaders (water for Destiny, fire for Halloween, magic energy
   for drives + casts)
2. Chiptune music loops + event cues (~1d)
3. Tier 3 shaders applied broadly (heat haze, chromatic aberration on
   more events)
4. Per-world signature decorations beyond the MVP one-each
5. Composite form banners (Pair / Royal Guard / Wayfinder Trio)
6. Real-token MP per adapter (~½d each tool)
7. Renown star-rank UI on wielder cards
8. Cura / Curaga tier verbs
9. Replay mode (record event JSONL → playback)
10. Outbound MCP server

### Post-v1 directions — Phase 2B (re-ranked 2026-04-28)

After surfacing the real north star with the user — **"focus me where
I'm needed, and let me understand the situation in 5 seconds"** — the
priority order was rewritten. Inspired by
[AgentCraft](https://www.getagentcraft.com/) (parallel product in the
same category) but rescoped for keykeeper's actual personal use case:
solo developer running Claude + Cursor + Codex in parallel across
multiple repos, doing full-SDLC work (planning / debugging /
implementation / testing) with directive interactions (target files,
functions, commands).

**North star (locked):** attention-direction + in-context observability.
Everything else is downstream of these two.

11. **Attention-direction layer** *(~½d)* — letter feed evolves from a
    chronological severity stream into a real **priority queue**:
    "next thing that needs you" pinned at the top, scored by recency ×
    severity × wielder-status × time-since-acknowledged. Replaces the
    "scroll the feed" loop with an actionable single suggestion. Lives
    on the Throne Room and is the basis for push/relay surfaces.
    Augments (does not replace) the existing 3-tier letter feed
    (Q6) — the queue is a *new top-pinned widget* fed from the same
    letter store.
12. **Quest system** *(~1.5d — ½d core, ½d UI, ½d persistence + Renown wiring)* —
    every Dispatch / Send word / Decree
    auto-creates a **Quest** with a thematic heroic name (LLM-generated
    from the prompt — e.g., *"Sora's Trial: The Loader Bug"*). On
    completion, generate a 3-word title + 1-sentence recap; persist
    indefinitely. Tracks duration, token spend, lines added/removed,
    subagents spawned. UI surfaces:
    - Wielder card shows **active quest title** + **last completed
      quest** subtitle.
    - New **Quest Log** tab/panel on Throne Room (active /
      completed / failed lists).
    - Per-wielder quest history feeds existing **Renown** stat.
    - Sealing a world reads "all quests complete" — narrative beat
      lands harder than the current generic seal flow.
    Subsumes the older "session-goal banner" and "recent-activity
    summary" ideas — Quest is a richer concept covering both. Borrowed
    from AgentCraft Missions; KH-recoded as the King's bestowed quests.
    See Q36 for the naming-model question (Anthropic API vs piggyback
    vs local model).
13. **In-context observability** *(~1d)* — when a letter pulls you to a
    wielder, the rest of the situation is immediately legible:
    - **Permission context**: when Claude blocks on a tool ask,
      surface the command + Claude's reasoning right before it +
      risk-level chip. Not "approve y/n" but "approve y/n KNOWING
      this".
    - **Why-trace**: for any tool call, expandable "what led to this"
      (recent assistant text + prior tool results). Cheap to render
      from existing event stream.
    - **Stuck-with-explanation**: extend existing "3+ same tool"
      detection to *describe* the loop. ("Sora has tried Edit on
      `World.ts` 4 times — diffs are oscillating between two states.")
14. **Decree verb (directive interaction)** *(~1.5d — ½d composer, ½d
    pickers, ½d Standing Order loop runner)* — sixth verb. Per-card
    button alongside Send word. UI: file picker (with recent-files +
    @-mention typeahead), function picker (parsed from open files),
    shell command runner. Sends a structured prompt under the hood
    (e.g., "Look at `World.ts:227` and tell me why the loader is
    failing" or "Run `bun test` and report"). KH-flavored as a royal
    proclamation — gold sigil, formal font. Justifies breaking the
    "exactly five" rule because directive ≠ gentle. See Q39 for
    composer UX specifics.

    Sub-mode: **Standing Order** — same Decree composer with an
    interval picker (1m / 5m / 15m / 30m / 1h). The decree recurs
    until recalled. Use cases: "every 30m, run `bun test` and report",
    "every hour, check Vercel deploys". Standing Orders show on the
    wielder card with a recurring-clock badge; halt with one click.
    Borrowed from AgentCraft Loops; KH-recoded as a royal standing
    order. See Q37 for guardrails (max iterations, stop-on-failures,
    cost cap).
15. **Voice input** *(~2h)* — mic button in Send word + Decree
    composers. Web Speech API (local STT — no audio leaves the
    device), auto-sends after brief silence. Tiny lift but
    disproportionate value on mobile (#16). King speaks the decree
    aloud rather than typing. See Q38 (transcription-only locked for
    v1; voice commands deferred).
16. ❌ **Mobile companion (PWA)** — **Killed (2026-04-28)** per Q29.
    Real pain is desktop attention-direction with 3–5 parallel
    agents, not AFK monitoring. Item preserved for if/when scope
    flips. See Q29 for the cascading consequences (notifications
    reframed, voice survives, etc.).
17. **Desktop OS notifications** *(~2h — Electron `Notification` API +
    4 trigger handlers + per-trigger settings toggle)* — was Web Push.
    Reframed per Q29. Four triggers (per Q30=d):
    - **Critical letters** from the attention queue (HP < 25%,
      world fallen, error)
    - **Permission requests** (#18 — Claude blocks on a tool ask)
    - **Important letters** (session_end, world cleared, world →
      danger)
    - **Plan approvals** (when Claude proposes a plan)
    Click → focus keykeeper window + take the suggested verb action.
    Quiet hours 22:00–08:00 by default, configurable. Per-trigger
    toggle in settings (mute any class).
18. **Permission approval surface** *(~1d — Claude hook integration +
    reply plumbing + risk-level classifier)* — was "Permission-from-chat".
    Reframed per Q29 (chat relay is deferred). When Claude Code
    blocks on a permission ask, surface as a Critical letter +
    desktop notification with permission-context observability (#13).
    Buttons: yes / no / once. King grants permission as a verb.
    Default-deny on timeout. See Q32.
19. **Discord / Slack relay** *(~1d, when revived)* — **deferred per
    Q31.** Letters mirror to a personal channel; verbs work as bot
    button presses. Single-tenant bot. Build only if desktop
    notifications + in-app priority queue prove insufficient. Choices
    narrowed to Discord or Slack (not Telegram).
20. **Shared kingdoms** — **deferred indefinitely per Q28=a.**
    User confirmed solo workflow; no teammate sharing today. Stays
    on the radar in case scope flips. See Q33–Q35.

---

## Locked decisions (Q1–Q27)

Frozen reference. Grouped by topic. Decisions marked ✅ are locked.
For active live questions, jump to [Open questions](#open-questions-q28q44-live-work).

### Direction & framing

1. ✅ **Sims-KH or something else?** — **Sims-KH locked for v1; expanded
   for Phase 2B.** Player nudges autonomous wielders. Original v1 verbs
   were strictly gentle (suggest, comfort, dispatch). **Updated
   2026-04-28:** real workflow has a directive component (target
   files/functions/commands) that the gentle-only verb set
   under-served. Phase 2B adds **Decree** as a sixth verb — kept
   visually distinct from gentle verbs (gold sigil, formal framing) so
   the spectator-strategy tone holds while the directive flow is
   first-class. Still not tick-by-tick RTS commanding; closer to a King
   issuing formal proclamations vs writing personal letters.
2. ✅ **Name?** — **`keykeeper` locked.** Renames `package.json` "name",
   user-data path (`~/Library/Application Support/kh-rts` → `keykeeper`,
   acceptable to lose prior local state for v1), and README copy.
   Repo directory name is the user's call — can stay `kh-rts` on disk.
3. ✅ **Audience?** — **Hybrid (private but tidy) locked.** Built for
   personal use, but commit cleanly with an honest README. macOS-first,
   no cross-platform investment, no elaborate onboarding. Visual polish
   for own enjoyment, not for stranger-screenshots.

   > **Re-opened by Q28** (2026-04-28): adding Phase 2B companion
   > surfaces (mobile, push, relay) pushes the project toward
   > tidy-public or commercial-trajectory. Q28 carries the live
   > question; Q3 stays as the v1 baseline.

### Throne Room

4. ⚠️ **Cinematic vs HUD-y?** — **Original v1 lock superseded by Q40.**
   Original (Hybrid): Phaser ambient `ThroneScene` as background +
   React HTML overlay panels on a dedicated Throne tab. **Updated
   per Q40 (2026-04-28):** Throne becomes a **side overlay panel**
   alongside the unified Star Chart map (Q40.1=a). Wielder cards +
   letter feed live in the side panel; the main canvas is the map.
   The Phaser ambient ThroneScene becomes obsolete (no separate
   Throne canvas). React side panel + Phaser unified map share the
   Zustand store as before.
5. ⚠️ **Default scene on app open** — **RE-OPENED 2026-04-28** by Q40
   (unified-map architecture). Original v1 design (3-scene
   Throne / Gummi / Arena with cinematic dive) is being replaced with
   a single pan/zoom unified-map. See [Q40](#open-questions-q28q40-live-work)
   for the new architecture and its sub-questions (Q41–Q44).

   **Original v1 lock (preserved as historical context):** Throne
   Room as home, Gummi Map demoted to navigator. Top tabs
   `Throne | Gummi Map | <active world>`. Cinematic gummi-ship flight
   on dive (~1.5–2s). Hold Shift / press Esc to skip cinematic. Seal
   fanfare pulls camera up to gummi map then back down.
6. ✅ **Letter feed** — **Locked.** Three tiers:
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
7. ✅ **Quick-act buttons** — **Hybrid C locked.** Verbs live next to
   their targets:
   - Top of Throne Room: **Dispatch** (kingdom-wide spawn — opens
     world/tool/role picker)
   - Per-wielder card: **Send word**, **♥ Comfort**, **× Recall**
   - Per-world (in throne, gummi map, world arena header): **Seal**
     verb when the world is eligible.
   The card layout is its own command panel — actions sit where you're
   already looking. No modal-soup of "pick a wielder, pick an action".

### Player verbs

8. ✅ **Comfort cost & cooldown** — **Defaults locked.** 50µ per use,
   +30 HP, 30s cooldown per wielder. Available when HP < 100 and status
   ≠ fallen. KH Cure chime + small green bell + sparkles visual.
   Cura/Curaga tiers deferred to polish phase.
9. ✅ **Seal the keyhole trigger** — **Locked. No git/PR auto-detection.**
   The King decides. Flow:
   - **session_end (HP > 0)**: Important letter — *"Sora finished session
     in kh-rts. Plan complete?"* with `[✦ Seal keyhole]` and `[↻ Iterate]`.
     Seal → cinematic fanfare + permanent gold keyhole. Iterate → opens
     "Send word" modal pre-filled with a clarification template; sending
     resumes/re-spawns the same wielder.
   - **session_end (HP = 0)**: Critical letter — *"Sora fell in kh-rts.
     World needs help."* with `[Dispatch new wielder]` and `[Dismiss]`.
     World stays unsealed + visibly fallen on gummi map.
   - **Per-world Seal button** always available as manual fallback.
   - Letter expires from feed in 5 min; world stays unsealed; manual
     seal still possible.
   - **Visual**: KH light beam + gold keyhole materialization + chime.
     Permanent gold-keyhole decoration on the gummi planet.
10. ✅ **Decision moment thresholds** — **Locked starter values.** Easy
    to tune later by feel.
    - HP < 25% → Critical letter, suggests Comfort
    - Stuck loop (same tool name + same input args 3+ times in 60s, OR
      3+ tool_results with no assistant_text between) → Notable letter
      *"Send a Hint?"* with Send word action
    - Subagent quiet > 5 min → Important letter `[Recall] [Wait]`
    - World alert → danger transition → Important letter (one-shot)
    - Drive activated → Notable letter (info, no action needed)

### State & persistence

11. ✅ **Where does persistent state live?** — **JSON file locked.**
    Path: `~/Library/Application Support/keykeeper/state.json`. Read on
    startup, debounced writes (200ms after last change). SQLite reserved
    for if/when we add replay or leaderboards. Treat as a simple
    file-store key/value.
12. ✅ **What persists across sessions?** — **Locked.**
    - **Wielder identity** = `(tool, cwd-resolved-to-repo-root)` tuple.
      "Claude in kh-rts" is one wielder; "Cursor in kh-rts" is a
      different wielder. Stable across sessions.
    - **Per wielder**: visit count, seal count, fall count, total munny
      earned, last seen
    - **Per world (repo root)**: sealed state, total seals, last visit,
      total clears, total falls
    - **Kingdom-wide**: total munny vault (lifetime), sealed-worlds
      count, kingdom founded timestamp
    - **Mute list** stays in localStorage (renderer-only)
    - **Not persisted**: live HP / MP / Focus, active sessions, live
      heartless, active letters, selection
    - **Renown stat** (derived from persisted fields, visible on wielder
      card as star rank): `visit + seal×3 − fall×2`. Tiers: New ·
      Apprentice ★ · Veteran ★★ · Hero ★★★.
    - **Real-token MP** (drain MP from actual tool token counts) **deferred
      to polish phase** — needs a per-adapter parser; ~½ day per tool.
    - **Reset path**: a "Reset Kingdom" verb in settings, or `rm
      ~/Library/Application Support/keykeeper/state.json`.

    > **Phase 2B addition** (when #12 ships): **Quests** persist
    > indefinitely as a per-(tool, repoRoot) array of records
    > `{ questId, name, recap, durationMs, tokens, linesAdded,
    > linesRemoved, subagentCount, status, startedAt, endedAt }`.
    > Cap at e.g. 200 most-recent per wielder; archive older to a
    > separate file if needed. **Standing Orders** persist as
    > `{ orderId, wielderId, prompt, intervalMs, maxIterations?,
    > maxTokens?, iterationsRun, status }`.
13. ✅ **Bonds** — **Yes for v1, but scoped to subagent relationships
    only.** Independent peer wielders in the same repo don't bond
    (they're not actually coordinated). Subagent spawn = automatic bond.
    Visualized as:
    - Throne Room: child's card visually nested under parent's, tether
      line between
    - World Arena: existing gold tether made more prominent
    - Letters attribute subagent activity to the parent
    - Mutual buff: shared Focus regen tick while bond is active
    - Composite forms when ≥1 child alive: 1 = Pair, 2 = Royal Guard, 3
      = Wayfinder Trio / Final Form (already does Mickey promotion)
    Most linkage already exists (parentSessionId, tether, Mickey). New:
    throne nesting visual, shared-Focus buff, composite name banner.
14. ✅ **Time-of-day cycle in arena** — **Yes, in v1.** Cosmetic
    overlay tinted by `Date.now() − sessionStartTime`:
    - 0–3 min: bright daylight, cool blue tint
    - 3–10 min: warm afternoon, amber
    - 10–20 min: sunset orange, long shadows
    - 20+ min: dusk/night, lamp posts brighter, drive auras pop more
    Multiple sessions per world → use the most-recently-started session's
    age as tiebreaker. Tune dusk so pixel-art readability holds.
    Implemented as part of the atmosphere pass.

### Visuals

15. ✅ **Sprite path** — **A (pixel art) locked → SUPERSEDED in
    practice.** Original lock: true 32×32 pixel-art keybladers with
    hand-curated 6–8 color palette, 4-direction × 4-frame walk cycles,
    etc. **Actual implementation diverged**: keybladers are hi-res
    painterly pixel-art (~290×200/frame, 32-frame sheets) sourced via
    AI-generation + concept-art extraction. Heartless, landmarks, and
    iso tiles followed Path A as specified (32×32, 64×64). The mixed
    resolution works because the global CRT + bloom + vignette stack
    ties everything together. Treat Q15 as historical context — see
    [Visual direction](#visual-direction) for current state.
16. ✅ **Atmosphere pass first?** — **Yes, locked.** Starting on Gummi
    Map (home view, fastest to test, dials in the CRT shader before
    committing the sprite pipeline). Path-agnostic visual lift validates
    the technique before investing in pixel art.
17. ✅ **Custom shader budget** — **All 9 shaders locked, tiered.**
    - **Tier 1 — Global pass (~1d)**: CRT scanline + curvature, bloom,
      vignette, color grade. Runs on every scene. Stack order: color
      grade → bloom → scanline → vignette.
    - **Tier 2 — Per-scene contextual (~1.5d)**: water (Destiny),
      fire (Halloween Town), magic energy (drive auras + cast effects,
      replacing current CSS-tween circles).
    - **Tier 3 — Event-driven moments (~0.5d)**: displacement / heat
      haze (seal fanfare, summons), chromatic aberration (KO, critical
      HP pulse).
    - Total ~3 days. Cut Tier 2/3 if midway it's clearly overkill;
      Tier 1 is non-negotiable for path A's look.
18. ✅ **Per-world arena theming** — **Hybrid C locked.** Shared arena
    *system* (same iso grid, same combat, same base layout). Theme
    controls swap:
    - Sky color / atmosphere
    - Ambient particle color
    - Color grade LUT
    - 1–2 signature decorations replacing the base landmarks (e.g.,
      Halloween Town's spiral hill replaces Disney Castle on the same
      tile; Destiny Islands' palm grove replaces Hollow Bastion)
    Effort: ~3–4 hours total for the variation hooks + per-theme
    signature pieces. Full per-world tile sets deferred to polish.

### Audio

19. ✅ **Music style** — **Chiptune via Web Audio synth locked.** Pairs
    with path A pixel art (KH:CoM GBA precedent). Ambient-leaning, sparse
    phrases. v1 scope (~1d):
    - Throne ambient (slow, reverberant, royal)
    - Gummi flight (1.5s warp pulse)
    - Arena ambient (cozy 4-bar loop, low default volume)
    - Seal fanfare (8-bar triumphant cue, original "Dearly Beloved"-flavor
      motif)
    - KO sting (2-bar descending minor)
    - Drive activate (1-bar ascending arpeggio)
    - Letter arrival (single chime)
    Default volume 30% for ambient, mutable via existing 🔊 toggle.
    Per-world arena themes deferred to polish (~½d per theme × 6).
20. ✅ **SFX** — **Web Audio synth (current) locked, library expanded.**
    Cohesive with chiptune music. Existing sounds kept (select, edit,
    bash, web, summon, error, session_start, session_end, world_warp).
    New ones: seal chime, KO sting, drive activate, letter arrival,
    comfort bell. ~½ day to compose. Sample-based SFX deferred
    indefinitely (would fight the chiptune identity).

### Scope & shipping

21. ✅ **MVP definition** — **Locked. Shipped in ~7 focused days.**
    See P1–P10 in [Build phases](#build-phases) for the work-unit
    breakdown (was previously duplicated here; now single source of
    truth). Phase 2A polish list also lives in [Build phases](#build-phases),
    not here.
22. ✅ **First public ship** — Honest README ✅ shipped; first commit
    pending (see Status snapshot). No screenshots / GIF promotion
    expected pre-Phase 2B.
23. ✅ **Replay mode** — Phase 2A polish, item 9.
24. ✅ **Outbound MCP** — Phase 2A polish, item 10.

### Engineering

25. ✅ **Renderer / process model** — No change. Throne Room is React/HTML,
    gummi + arena are Phaser canvas. Already mixed cleanly via App.tsx.
26. ✅ **Phaser 4 filter pipeline** — Will validate as the first task of
    the atmosphere pass. If it doesn't work cleanly in Electron we
    fallback to CSS/SVG filters or a lighter shader path; we'll know in
    the first hour.
27. ✅ **Test fixtures** — Add as needed during build. Specifically for
    MVP: HP-critical fixture, stuck-loop fixture, subagent timeout,
    long-session for time-of-day verification.

## Open questions (Q28–Q40, live work)

Net-new directions added 2026-04-28 after looking at AgentCraft and
confirming the multi-agent watch room is a real product category.
None are locked yet — this section is the working list for the next
direction conversation. See [Recommended next decisions](#recommended-next-decisions-phase-2b)
for the suggested answer order.

28. ✅ **Audience trajectory revisit?** — **(a) strictly personal-tidy
    locked** (2026-04-28). Build for own use only; companion features
    only if useful to me; never publicize. Reaffirms Q3 with full
    Phase 2B scope in mind.

    **Cascading consequences:**
    - Q31 narrows: relay is single-tenant only (you run your own bot).
    - Q33–Q35 (shared kingdoms / cross-team composite forms): **deferred
      indefinitely.** Phase 2B item #20 stays on the radar but is not
      in scope until/unless Q28 flips. Treat as locked-deferred.
    - Q29 (PWA): tunnel-only (Tailscale / cloudflared) — no hosted
      public-internet exposure.
    - Anything implying shared infra, multi-user auth, support load,
      or public branding: out of scope by default.
29. ✅ **Mobile companion (PWA)?** — **Killed (2026-04-28).** User
    confirmed the actual pain is desktop attention-direction (focusing
    where you're needed *while at your desk*, with 3–5 parallel
    agents), not AFK monitoring. Mobile would solve a different
    problem they don't have. Phase 2B item #16 removed from the active
    plan; can be revived if/when an actual AFK-monitoring use case
    emerges.

    **Cascading consequences:**
    - **#17 Push notifications** reframed as **desktop OS
      notifications** (Electron's `Notification` API + system
      notification center), not Web Push + VAPID. Effort drops from
      ~½d to ~2h.
    - **TTL-preset tunnel architecture** (was for the PWA) — not
      needed.
    - **Voice (#15)** survives — desktop dictation still useful for
      hands-free Decree composition while reading code in another
      window.
    - **Permission-from-chat (#18)** name becomes slightly
      misleading; primary surface is desktop notification + in-app
      letter. Discord/Slack remains a future optional surface (#19).
30. ✅ **Notifications scope?** — **(d) all four triggers locked**:
    Critical letters + permission requests + Important letters
    (session_end, world cleared) + plan approvals. Per-trigger toggle
    in settings (mute any class). Quiet hours: 22:00–08:00 silent by
    default, configurable. **Transport reframed per Q29**: desktop OS
    notifications via Electron's `Notification` API, not Web Push.
31. ✅ **Relay platform?** — **Deferred (skip for now).** Build only
    if desktop notifications + in-app priority queue prove
    insufficient. When/if revived, choices narrow to **Discord** or
    **Slack** (both fit dev culture; Telegram dropped — wrong audience
    for solo-dev workflow). Single-tenant locked per Q28=a.

    **Phase 2B item #19** stays on the radar but moves below the
    sprint line.
32. ✅ **Permission approval depth?** — **(b) locked.** yes / no /
    once buttons on the letter, **plus** the command + Claude's
    reasoning + risk-level chip (Phase 2B #13's permission-context).
    "Approve y/n KNOWING this" — not blind buttons. Default-deny on
    timeout to avoid security holes. Edit-with-context (option c)
    deferred to a later iteration; ship (b) first.

    *(Renamed from "permission-from-chat" since #19 relay is deferred —
    primary surface is desktop notification + in-app letter; chat
    relay is future optional.)*
33. ✅ **Shared kingdoms — depth?** — **Deferred indefinitely** per
    Q28=a (strictly personal-tidy). Original options preserved below
    for if/when scope flips:
    - a. Presence-only · b. Spectator-shared · c. Co-op verbs.
34. ✅ **Shared kingdoms — identity & sync?** — **Deferred per Q28=a.**
    Original options: repo identity (`git remote` hash), user identity
    (GitHub OAuth / anon device key / email magic link), sync
    transport (server-mediated relay vs P2P).
35. ✅ **Composite forms across teams?** — **Deferred per Q28=a.**
    Cross-team composite forms (Pair / Royal Guard / Wayfinder Trio)
    require shared kingdoms first. Note: same-King composite forms
    (parent-subagent) ship as part of Phase 2A polish item #5.
36. ✅ **Quest system — naming model?** — **(a) Anthropic API locked**,
    architected via the **Vercel AI SDK** as a provider-agnostic
    abstraction so the model can be swapped later (local Ollama, other
    providers) without rewriting the call site. Quest naming lives in
    a small standalone module (e.g., `src/main/quest-namer.ts`) with
    one function: `nameQuest(prompt, eventLog) → { name, recap }`.
    User provides Anthropic API key in keykeeper settings; if missing,
    fall back to raw-prompt-as-name + last-assistant-text-as-recap (no
    LLM call). ~½¢/quest at current Anthropic pricing.
37. ✅ **Standing Order — guardrails?** — **Locked.**
    - **Max iterations**: hard cap, default 24, overridable per Order.
    - **Stop-on-failures**: pause after **3 consecutive failures**.
      "Failure" = agent KO **or** tool-call error.
    - **Cost cap**: skip for v1 — max-iterations is a good-enough
      proxy and one less knob. Revisit if loops feel risky in
      practice.
    - **Visibility**: recurring-clock badge on the wielder card;
      confirm dialog required before starting (single Decree stays
      one-click).
38. ✅ **Voice input scope?** — **(a) transcription-only locked.**
    Mic → text in Send word / Decree composer → manual review → send.
    Voice commands ("Hey King, recall Sora") deferred — mishearing
    causes destructive actions (Recall = kills agent), security model
    not worth the lift for v1. Useful on desktop too (hands-free
    Decree while reading code in another window — survives the
    mobile-killed reframe).
39. ✅ **Decree composer UX?** — **(b) layered composer locked.**
    Free-text primary; `@` opens file palette (recent files +
    typeahead), `/` opens command palette (shell command runner +
    common commands). Power-user UX. Decree owns its own composer
    distinct from Send word (which stays gentle / free-text only).

    **Stamp templates (option c) deferred** to a polish iteration —
    add as muscle-memory accelerators after the layered composer is
    proven in actual use.
40. ✅ **Unified-map architecture (replaces 3-scene drill-down)** —
    **Locked 2026-04-28.** Replace Throne / Gummi / Arena tabs with a
    single pan/zoom canvas (the "Star Chart") where every world is
    visible simultaneously. Camera pans with mouse-drag, zooms with
    scroll-wheel. Re-opens Q5 (3-scene drill-down → unified map);
    revises Q4 (Throne Room treatment); touches Q9 (seal fanfare).

    **Why:** Aligns with the locked north star (attention-direction +
    in-context observability). Matches the locked reference genre
    (The Sims, Don't Starve, Cult of the Lamb, Football Manager,
    Civilization, Crusader Kings, AgentCraft all use one continuous
    map with pan/zoom). The 3-scene design predated the north star;
    it accumulated rather than was deliberately chosen.

    **Architectural sub-decisions (Q41–Q44):**
    - **Q41 Throne Room fate = (a) side overlay panel.** Wielder
      cards + letter feed pinned to a fixed side panel; map fills
      the rest. Always visible. No tab switching.
    - **Q42 Camera behavior = (a) strict manual + click-to-pan.**
      User drives camera (mouse drag, scroll-wheel zoom). Camera
      *only* moves on explicit user actions. Clicking a wielder card
      or a letter pans the camera to that wielder/world. Attention
      indicators (pulses, badges) signal but never auto-move the
      camera.
    - **Q43 Map layout = (c) constellation/clustering.** Worlds
      cluster by shared git remote host (e.g., all `github.com/foo/*`
      repos cluster together) or shared parent path on disk
      (`~/work/*` vs `~/personal/*`). Hash-based fallback for
      ungrouped repos. Cluster boundaries are visual but not
      interactive.
    - **Q44 Zoom-out world rendering = (b) single iso miniature.**
      Same iso plane rendering at all zoom levels — camera scales
      it. Wielders appear as dots at zoom-out, full painterly
      sprites at zoom-in. Themed signature landmark per world
      (castle / spire / palm grove) provides at-a-glance iconography
      even at small scale. Pulse colors + alert badges signal
      attention. Single rendering pipeline; no LoD pop.

    **Cascading defaults** (assumed unless overridden):
    - **Inter-world space**: keep current Gummi Map starfield
      aesthetic (dark space with subtle stars).
    - **Persistent vs ephemeral worlds**: show worlds with active
      sessions OR sealed status OR recent activity (last 30d).
      Older inactive worlds collapse into a "history" pane.
    - **World size on map**: fixed (all worlds same on-canvas
      footprint). Activity-proportional sizing creates visual chaos.
    - **Sealed worlds**: gold-keyhole marker stays at all zoom
      levels; the sealed world's iso plane fades slightly to signal
      "story complete".
    - **Cluster labels**: visible at zoom-out only (e.g., "WORK ·
      6 worlds"). Fade out at full zoom-in.

41. ✅ **Q40.1 Throne Room fate** — locked (a) side overlay. See Q40.
42. ✅ **Q40.2 Camera behavior** — locked (a) strict manual + card-click
    pan. See Q40.
43. ✅ **Q40.3 Map layout** — locked (c) constellation/clustering. See Q40.
44. ✅ **Q40.4 Zoom-out world rendering** — locked (b) single iso
    miniature scaled by camera. See Q40.

---

## Existing work that survives the redesign

Pre-MVP infrastructure that ships forward unchanged:

- ✅ Multi-tool spawn + passive monitor (Claude, Cursor, Codex)
- ✅ Hook bridge for Claude
- ✅ SQLite tail for Cursor
- ✅ JSONL tail for Codex
- ✅ Repo→world resolution
- ✅ Themed gummi map planets
- ✅ Heartless combat
- ✅ Drive forms
- ✅ Victory / KO poses
- ✅ Patrol idle behavior
- ✅ Unit dock with tool pills + pagination
- ✅ Streamdown chat panel
- ✅ Fixture / demo mode
- ✅ Web Audio synth SFX
- ✅ Mute persistence

Pre-MVP work that was redesigned:

- ✅ "RTS" framing in copy + name → renamed to **keykeeper** (Sims-style)
- ✅ "Always-on Gummi Map as home" → demoted to navigator; Throne Room
  is now home
- ✅ Drive Form as transient flash → became steady **Focus** gauge on
  Throne card

---

## Recommended next decisions (Phase 2B)

**All open questions answered as of 2026-04-28.** Phase 2B is fully
unblocked for implementation.

**Locked decisions:**
- Q28 audience = strictly personal-tidy
- Q29 mobile/PWA = killed (desktop-only project)
- Q30 notifications = all 4 triggers, desktop OS (not Web Push)
- Q31 relay = deferred (Discord/Slack later if needed)
- Q32 permission = yes/no/once + context (Phase 2B #13)
- Q33–Q35 shared kingdoms = deferred indefinitely
- Q36 Quest naming = Anthropic via AI SDK abstraction
- Q37 Standing Order = max 24 / stop on 3 failures / no cost cap
- Q38 voice = transcription-only
- Q39 Decree composer = layered (`@` files, `/` commands)

**Active Phase 2B build items** (with effort estimates, totaling
~5.5 focused days):

| # | Item | Effort | Notes |
|---|---|---|---|
| 11 | Attention-direction layer (priority queue) | ~½d | Foundation for #17/#18 |
| 12 | Quest system | ~1.5d | Biggest observability lift; needs Anthropic API key |
| 13 | In-context observability (permission-context, why-trace, stuck-with-explanation) | ~1d | Pairs with #18 |
| 14 | Decree verb + Standing Order sub-mode | ~1.5d (1d core + ½d loop runner) | Your stated workflow needs this |
| 15 | Voice input (transcription-only) | ~2h | Cheapest win, no deps |
| 17 | Desktop OS notifications | ~2h | Was Web Push; Electron `Notification` API |
| 18 | Permission approval surface | ~1d | Was "permission-from-chat"; pairs with #13 |

**Deferred (not in active sprint):**
- #16 Mobile PWA — killed per Q29
- #19 Discord/Slack relay — deferred per Q31
- #20 Shared kingdoms — deferred per Q28=a

**Suggested first sprint order** (architecture refactor first, then
build on the new foundation):

0. **Unified-map refactor (Q40)** — ~1–2d. Replace 3-scene
   Throne/Gummi/Arena with single pan/zoom Star Chart canvas + side
   overlay panel for cards/letters. Camera control (drag pan,
   scroll-wheel zoom, click-card-to-pan). Constellation clustering by
   git remote / parent path. Single iso rendering at all zoom levels.
   Sealed worlds get persistent gold-keyhole markers. **Blocks #11
   and #12** (which assume the new architecture). Other items below
   are scene-agnostic and can interleave.
1. **Voice (#15)** — ~2h. No dependencies, instant ship. Can run in
   parallel with #0.
2. **Desktop OS notifications (#17)** — ~2h. Foundation for surfacing
   the priority queue events. Scene-agnostic.
3. **Decree core (#14)** — ~1d. Composer + file/command palette.
   Per-card button → modal; scene-agnostic.
4. **Attention-direction layer (#11)** — ~½d. The queue itself,
   surfaced in the side overlay panel + as pulsing world badges on
   the map. Needs #0 done.
5. **Quest system (#12)** — ~1.5d. Needs Anthropic API key in
   keykeeper settings. Quest Log lives in the side overlay panel.
6. **In-context observability (#13)** — ~1d. Permission context +
   why-trace + stuck-with-explanation.
7. **Permission approval surface (#18)** — ~1d. Builds on #13 + #17.
8. **Standing Order (#14 sub-mode)** — ~½d. Loop runner on top of
   Decree.
