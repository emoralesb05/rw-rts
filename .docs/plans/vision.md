# kh-rts — Vision & Open Questions

Supersedes `roadmap.md` (which is stale — references Phaser 3, "RTS" framing,
and pre-multi-tool design). Keep `roadmap.md` for historical context only.

---

## TL;DR

**kh-rts is a Kingdom-Hearts-themed *agent watch room* — a Sims-style
spectator strategy game where the player is the King at Disney Castle, their
keyblade wielders (Claude / Cursor / Codex sessions) are out clearing worlds
(repos), and the player nudges, dispatches, and witnesses rather than
commanding tick-by-tick.**

Real agent activity drives autonomous Sim behavior. The player's verbs are
gentle (dispatch, prompt, comfort, recall, seal). The visual goal is a
distinctive, atmospheric stylized 2D look — not flat primitives.

---

## What this is (and isn't)

**It is**: a long-running, ambient, observational tool that makes monitoring
multiple agent sessions feel like *watching a kingdom unfold*. Closer to
Football Manager / Frostpunk / The Sims than to StarCraft.

**It is not**: an RTS. The player does not command units tick-by-tick. The
agents have their own minds (literally). RTS framing was wrong because it
oversells player agency the loop doesn't actually have.

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
- **Intervene**: 1 of 5 verbs (below)
- **Witness**: world cleared (sealed, fanfare) or fallen (KO)

---

## Scenes

### 1. Throne Room (NEW — the missing piece)

The default home. Optimized for **glanceability**, not motion. Replaces
"always-on Gummi Map" as the home screen.

- **Wielder card grid**: each active session as a portrait card with HP /
  MP / Focus bars, mood icon, current world, last activity stamp
- **Letter feed**: ranked event stream — errors, session_end, decision
  prompts. Severity-colored (info / warning / danger)
- **King's verb stamps**: 5 buttons (see verbs below)
- **Munny vault counter**: kingdom-wide total
- **Sealed worlds tally**: roster of cleared keyholes
- **Background**: cinematic vs HUD-y — open question (see § Open questions)

### 2. Gummi Map (have it)

Demoted from "home" to "navigator". Still useful when you want spatial
overview. Themed planets, alert states, dive-in. Already shipped:
- 6 themed worlds (Disney Castle, Hollow Bastion, Traverse Town, Destiny
  Islands, Twilight Town, Halloween Town), assigned by hash of repo root
- Alert pulse colors per state
- Heartless count badge, cleared-world gold star

### 3. World Arena (have it, improving)

The cinematic dive — slowest, most KH-flavored scene. Where ambient patrol
+ Heartless combat + drives live. Intentionally **not** where the player
spends most of their time.

Already shipped:
- Isometric grid + 3 themed landmarks (Disney Castle, Hollow Bastion,
  Traverse Town)
- 18 chibi unit silhouettes + animated spritesheets
- Heartless combat (errors spawn, edits clear)
- Drive forms (Valor / Wisdom / Final) with auras + activation flash
- Victory + KO poses on session_end / HP=0
- Patrol-based idle behavior (units wander between landmarks)
- Munny counter, tool pills (Claude / Cursor / Codex color-coded)

---

## Player verbs (exactly five)

| Verb | Maps to | Status |
|---|---|---|
| **Dispatch a wielder** | spawn agent (claude/cursor/codex) with prompt | ✅ wired |
| **Send word** | follow-up prompt to a working agent | ✅ wired |
| **Comfort** | restore HP/MP for a small munny cost | ❌ new |
| **Recall** | kill agent | ✅ wired |
| **Seal the keyhole** | mark world done — `git push` / PR merge fanfare | ❌ new |

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
| World | Repo (resolved by `.git/` ancestor walk) ✅ |
| Wielder | Agent session ✅ |
| Heartless | Errors ✅ |
| Munny | Successful tool-call count × 5 ✅ |
| Drive Form | Tool-streak reward (transient flash) ✅ |
| Focus (NEW) | Steady gauge replacing Drive's flash — visible on Throne Room card |
| Heart (NEW) | Long-term mood — accumulates from clears, drains from KOs |
| Bond (NEW) | Two wielders working same repo close in time → linked icons + small mutual buff |
| Keyhole sealed (NEW) | `git push` to main / PR merge / manual button |
| Mood (NEW) | `eager / focused / fatigued / desperate / triumphant` — drives idle anim |
| Memory (NEW) | Per-wielder persistent log: "Sora's been to Destiny Islands ×4" |

---

## Visual direction

**Honest reckoning**: current visuals are bleak. Flat primitives on flat
black, no atmosphere, no global pass. Even great sprites would look amateur
on top of that.

### Phase 1: Atmosphere pass (cheap unlock, ~2 hours)

Same primitives, dramatically better feel. Phaser 4's filter pipeline does
most of this:

- Gradient sky per world theme (sunset for Twilight, starfield + nebula for
  Gummi Map, deep ocean blue for Destiny)
- Parallax layers — distant silhouettes, mid-ground clouds drifting,
  foreground particles
- Global filters: bloom on bright accents, color grade per scene, vignette,
  mild chromatic aberration
- Floating particle ambience (embers, sparkles, dust motes)
- Soft radial light source with falloff — characters cast shadows, keyhole
  glows, lamp posts have halos
- Better drop shadows under every unit

### Phase 2: Sprite direction (commit to one, ~1–2 days)

| Path | Look | Reference | Effort | KH fit |
|---|---|---|---|---|
| **A. Pixel art** | 32×32 hand-keyed sprites, integer scaling, CRT filter | KH:CoM, KH:DDD overworld | ~2 days | Highest |
| **B. Painterly silhouette** | Strong ink shapes + rim light + textured backgrounds | Don't Starve, Cult of the Lamb | ~1.5 days | Medium |
| **C. Parchment war-room** | Top-down ink map, muted reds/golds, stamped tokens | Crusader Kings + tactical RPG | ~1 day | Medium |

**Recommendation**: B. Strong silhouettes hide that they're rectangles;
lighting/atmosphere does most of the work; distinctive enough that nobody
mistakes it for Phaser tutorial art.

---

## Build phases

All decisions locked. MVP ships in ~5–7 days of focused work, in this
order. Each phase is a coherent ship-able unit; check the visual against
the previous phase before moving on.

### MVP

**P1. Rename to keykeeper** (~30 min)
- `package.json` name field
- README (when written)
- User-data path migrates implicitly via Electron's `app.getPath`
- Repo directory name on disk is the user's call

**P2. Phaser 4 filter validation** (30 min, blocking gate)
- Confirm Phaser 4 filter pipeline works in this Electron setup
- One throwaway test scene with bloom + vignette
- If broken, fall back to CSS/SVG filter approach

**P3. Atmosphere pass on Gummi Map** (~1d)
- Tier 1 shaders globally: CRT scanline + curvature, bloom, vignette,
  per-scene color grade
- Gradient sky, parallax star/nebula layers, particle drift
- Validate visual lift before continuing

**P4. Pixel art sprite generator v2** (~1.5d)
- Rewrite `scripts/generate-sprites.ts` for 32×32 pixel-art output
- 6–8 color palette per character, no anti-aliasing
- 4-direction × 4-frame walk cycles + idle + swing/cast frames
- 64×64 pixel-art landmarks (Disney Castle, Hollow Bastion, Traverse
  Town + 3 new for the new themes)
- Pixel-art Heartless: Shadow + Soldier + Large Body
- Pixel-art iso ground tiles
- Integer-scaling render setup in Phaser

**P5. Atmosphere pass on World Arena** (~½d)
- Same Tier 1 stack tuned for arena
- Time-of-day cycle (overlay tinted by session age)
- Per-world atmosphere swap (sky / particles / color grade) via theme
- 1 signature decoration per theme (replaces base landmark)

**P6. Throne Room scene** (~1.5d)
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

**P7. Persistent state JSON** (~½d)
- `~/Library/Application Support/keykeeper/state.json`
- Wielder identity = `(tool, repoRoot)` tuple
- Persisted: visit / seal / fall counts per wielder, sealed state per
  world, lifetime munny, kingdom-founded timestamp
- Debounced 200ms writes
- Reset path: settings verb or manual `rm`

**P8. Decision-moment letters + verbs** (~1d)
- Simulation layer: HP < 25%, stuck-loop (3+ same tool / 60s), subagent
  > 5 min, world → danger transition, drive activated
- Letter generation tied to thresholds, with rate-limit + collapse
- **Comfort verb**: 50µ for +30 HP, 30s cooldown per wielder, KH Cure
  chime + green sparkle visual
- **Seal flow**: session_end (HP > 0) → `[Seal] [Iterate]` letter; HP=0
  → `[Dispatch new] [Dismiss]` letter
- **Iterate** opens Send word modal pre-filled with template

**P9. Cinematic dive + seal fanfare** (~½d)
- Dive transition: Throne → Gummi Map flight (1.5s) → World Arena
- Seal fanfare: pull camera to Gummi Map, light beam, gold keyhole
  materializes, KH chime, permanent gold-keyhole on planet
- KO transition: arena darken + chromatic aberration sting (Tier 3
  shader, scoped to this moment)
- Skip with Shift / Esc

**P10. README + first commit** (~½d)
- Honest README: what it is, install, drop-zones, troubleshooting
- First git commit (repo currently uncommitted)

### Post-v1 polish (priority order)

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

---

## Open questions (the things we need to answer)

These are blockers for committing to the plan. Grouped by topic.
Decisions are marked ✅ as they're locked; iterating on them in
conversation order.

### Direction & framing

1. ✅ **Sims-KH or something else?** — **Sims-KH locked.** Player nudges
   autonomous wielders and can hand them tasks / updates when necessary.
   Active verbs are gentle (suggest, comfort, dispatch), not tick-by-tick
   commanding.
2. ✅ **Name?** — **`keykeeper` locked.** Renames `package.json` "name",
   user-data path (`~/Library/Application Support/kh-rts` → `keykeeper`,
   acceptable to lose prior local state for v1), and README copy.
   Repo directory name is the user's call — can stay `kh-rts` on disk.
3. ✅ **Audience?** — **Hybrid (private but tidy) locked.** Built for
   personal use, but commit cleanly with an honest README. macOS-first,
   no cross-platform investment, no elaborate onboarding. Visual polish
   for own enjoyment, not for stranger-screenshots.

### Throne Room

4. ✅ **Cinematic vs HUD-y?** — **Hybrid locked.** Phaser ambient
   `ThroneScene` as background (animated castle hall, banners swaying,
   light beams, particle dust — no game logic, ambient only). React HTML
   overlay panels for the info-dense surface (wielder cards, letter feed,
   verb buttons, munny vault, sealed-worlds tally). Both mount together
   when the user is on the throne route; both read from the same Zustand
   store. Effort: ~1 day.
5. ✅ **Default scene on app open** — **Throne Room locked** as home,
   Gummi Map demoted to navigator/transition role. Specifically (option D
   from conversation): top tabs are `Throne | Gummi Map | <active world>`.
   App opens to Throne. Diving into a world from a wielder card triggers
   a cinematic gummi-ship flight (~1.5–2s) — camera zooms out of castle,
   cuts to gummi map, streaks across to target planet, lands in arena.
   Sealing a keyhole pulls camera up to gummi map for the keyhole-lock
   fanfare, then permanent gold-keyhole decoration on the planet.
   Returning to throne is a gentler fade. **Hold Shift / press Esc to
   skip the cinematic** — instant warp for repeated dives. Direct clicks
   on the Gummi Map tab are static (no flight).
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

15. ✅ **Sprite path** — **A (pixel art) locked.** True 32×32 pixel-art
    sprites with hand-curated 6–8 color palette per character, 4-direction
    × 4-frame walk cycles, idle + swing/cast/summon frames. 64×64
    pixel-art landmarks. Pixel-art iso ground tiles. Pixel-art Heartless
    (Shadow / Soldier / Large Body for variety). CRT scanline + bloom
    shader as the global tying filter. Generated programmatically with
    `@napi-rs/canvas` like the existing pipeline, but at smaller
    resolution with no anti-aliasing.
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

21. ✅ **MVP definition** — **Locked. ~5–7 days of focused work.**

    **In MVP:**
    - Rename to `keykeeper` (~30 min)
    - Atmosphere pass + Tier 1 shaders (CRT, bloom, vignette, color
      grade) on all scenes (~1d)
    - Pixel art sprites for all 18 wielders + 3 Heartless types + base
      landmarks (~1.5d)
    - Throne Room hybrid scene replacing Gummi Map as home (~1.5d)
    - Letter feed + decision-moment generators (~½d)
    - 5 verbs wired (Dispatch, Send word, Comfort new, Recall, Seal new)
      (~½d)
    - Session-end seal prompt + cinematic dive + seal fanfare (~½d)
    - Persistent state JSON + Sims-style memory (~½d)
    - Subagent bond visuals (~¼d)
    - Time-of-day arena cycle (bundled with atmosphere pass)

    **Post-v1 polish (in this priority order):**
    1. Tier 2 shaders (water, fire, magic energy)
    2. Chiptune music loops + event cues (~1d)
    3. Tier 3 shaders (heat haze, chromatic aberration)
    4. Per-world signature decorations (Halloween spiral, Destiny palm,
       Twilight clock tower)
    5. Composite form banners (Pair / Royal Guard / Wayfinder Trio)
    6. Real-token MP per adapter (~½d each tool)
    7. Renown star-rank UI (already persisted, needs display)
    8. Cura / Curaga tier verbs
    9. Replay mode
    10. Outbound MCP server
22. ✅ **First public ship** — Honest README + first commit at end of
    MVP. No screenshots / GIF expected pre-MVP.
23. ✅ **Replay mode** — Post-v1 polish, item 9.
24. ✅ **Outbound MCP** — Post-v1 polish, item 10.

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

---

## Existing work that survives the redesign

Almost everything ships forward:

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

Not surviving as-is:

- ⚠️ "RTS" framing in copy + name → rename to *Watch* something
- ⚠️ "Always-on Gummi Map as home" → demoted to navigator
- ⚠️ Drive Form as transient flash → becomes steady **Focus** gauge

---

## Recommended decision sequence

If you want to make progress without re-litigating later, answer in this
order:

1. **Q1, Q2, Q15, Q16** (direction + visual path) — locks the project's
   identity. 15 min of decisions.
2. **Q4, Q5** (Throne Room style + default scene) — locks the home
   experience.
3. **Q9, Q21** (seal trigger + MVP scope) — locks the shipping target.
4. Everything else can be answered as we hit it.

Once Q1/Q2/Q15/Q16 are answered, I can start Phase 1 (atmosphere pass)
immediately and we'll know within a few hours whether the visual lift
works.
