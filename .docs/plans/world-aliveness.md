# Plan: World aliveness — sprite behavior + canvas reactivity

**Status**: planned, not started · **Owner**: TBD · **Phase**: Post-MVP polish (gameplay-feel)

## Goal

Tighten the feedback loop between **what wielders are actually doing** and **what the canvas shows**. Today the visual layer trends "screensaver" — sprites patrol, heartless drift, but the world feels disconnected from real activity. Make the kingdom feel alive without breaking the locked KH-Sims spectator-strategy tone.

## What's already shipped (don't re-build)

A lot of the foundation is there per [`../vision.md`](../vision.md) Visual direction + Build phases:

- 4 keyblader archetypes (Vaelen / Selene / Ryder / Lyris) with painterly pixel-art sprites + 32-frame sheets (idle × 3 facings, walk × 3 facings, attack, cast)
- Heartless mobs (Shadow / Soldier / Large Body), 8-frame sheets, drift-toward-wielder logic
- Per-theme landmarks (64×64), iso ground tiles, time-of-day cycle
- Tier 1 shaders globally (CRT scanline, bloom, vignette, color grade)
- Tier 2 per-world atmospherics (water/fire/magic)
- Tier 3 event pulses (KO impact, seal flare)
- Drive-form auras, subagent tether
- HP/MP nameplate bars + multi-modal critical-HP feedback (red fill + border + bobbing "!")
- KH-flavored speech bubbles per archetype on lifecycle events
- Patrol idle, event-driven animation switching, death/victory poses
- Composite-form banners (Pair / Royal Guard / Wayfinder Trio)

That's the canvas-equivalent of "working chat panel + party list" — but the loop between agent activity and visible behavior is shallow. Most tool calls look similar; most idle moments look identical.

## Diagnosis — five places it feels bleak

1. **Tool calls are visually undifferentiated** — Bash, Read, Edit, Web, Write all play roughly the same cast/attack animation. The tool name shows up in the chip but the canvas doesn't tell you what kind of work is happening.
2. **Idle is monotonous** — the patrol behavior is one loop, played by all four archetypes regardless of personality. Vaelen and Selene look identical at rest. Once you've seen 30 seconds, you've seen the next hour.
3. **Heartless are mostly decorative** — they spawn on errors and drift, but they don't really *fight* the wielder. KO happens but it feels like a state change, not a story beat. The narrative "your wielder is being overwhelmed" doesn't visibly play out.
4. **Worlds don't react to outcomes** — successful turns, sealed keyholes, fallen wielders all happen but the world's overall aesthetic stays the same. A sealed Disney Castle and an active one look alike except for a small marker.
5. **No environmental cause-and-effect** — when a permission letter pops, when a stuck-loop hits, when a Drive form activates — these are big narrative moments in the chat layer, but the canvas barely notices. The two layers feel parallel rather than synchronized.

## Proposed additions, by tier

### Tier A — Cheap wins (each <½ day, high feel-per-byte)

1. **Per-tool VFX overlays** — small color-coded particle/glyph above the wielder when a `tool_use` event fires:
   - `Bash` → terminal-green text scroll glyph
   - `Read` → floating page / book icon
   - `Edit` / `Write` → keyblade swing arc + crystal shards
   - `Web` → portal swirl
   - `Grep` / search tools → magnifying glass pulse
   - MCP tools → generic crystal sigil with the MCP server color
   
   Implementation: a single VFX pool, keyed off the canonicalized tool name (the bridge already does this). One ~30-frame sheet per tool family, tinted at runtime.

2. **Per-archetype idle quirks** — replace the single patrol loop with archetype-specific idle behaviors that play during quiet stretches:
   - Vaelen (twilight) — broods, sits on a step, looks at the sky
   - Selene (dream-petal) — tends to a phantom plant, twirls ribbons
   - Ryder (forge) — polishes/sharpens keyblade, paces purposefully
   - Lyris (sea) — looks toward the horizon, skips a stone, stretches
   
   Implementation: 1 extra ~16-frame loop per archetype, picked at random when idle for >15s. Existing animation state machine already supports event-driven swap-in.

3. **Tool-result success/fail animation** — distinguish a successful tool result from an error in the wielder's pose: small fist-pump on success after 3+ consecutive successes; head-shake on error. Not every result, just streak triggers, so it stays meaningful.

4. **World breath** — slow ambient pulse on the per-world iso plane that intensifies when the wielder is mid-tool (`status: "working"`) and slows when idle. Already have the status field; needs a shader uniform tied to it.

5. **Letter↔canvas coupling** — when a letter is generated for a wielder, briefly flash the world's atmosphere in the letter's tone color (red for critical, gold for important, cyan for notable). Currently letters are just HUD events; this makes them visible from peripheral vision.

### Tier B — Medium investment (½–1 day each, distinctive but more code)

6. **Heartless combat loop** — when a heartless is alive in a world, the wielder actively engages:
   - Wielder pivots toward the heartless (existing facing change)
   - Plays attack animation (already have it)
   - Heartless takes damage on contact, dies on enough hits
   - On wielder error / stuck-loop, the heartless lands a "hit" — wielder HP visibly drops in a damage pop-up
   - Win/lose framing per Q21's lock: still flavor, not a game system. No tracking, no stats, no balance — just visible reaction to real events.

7. **Per-archetype tool style** — same tool, different visual:
   - Vaelen casts at range (projectile from raised keyblade)
   - Selene heals/buffs (radial bloom from staff)
   - Ryder charges in (quick step forward + heavy slash)
   - Lyris dashes (afterimage trail, repositions)
   
   Tool effect (Tier A #1) tints by tool; archetype controls the *delivery* animation. Pairs naturally.

8. **Environmental damage / repair** — on a `KO`, the wielder's iso tile darkens and cracks (one-time decal); on a successful seal, the cracks heal away with golden wisp particles. Permanent state until the next seal/KO.

9. **Renown level-up moment** — when a wielder crosses a Renown tier (New → Apprentice → Veteran → Hero), brief light burst + nameplate ring upgrade + a one-shot speech bark with the new title. ~½ day. (Renown stat is already persisted; just unused in canvas.)

### Tier C — Bigger lifts (>1 day, defer or roll into other plans)

10. **Quest visualization** — already in the [vision.md backlog](../vision.md#backlog) as a Phase 2A polish item with its own ~1.5d estimate. Not adding new scope here; quest banners + completion flares would naturally extend Tier A #5.

11. **Floating-text damage numbers on canvas** — already deferred per vision.md backlog. Out of scope for this plan; ship Tier B #6 first, evaluate need.

12. **Camera shake on critical events** — KO, seal fanfare. Cheap mechanically (Phaser camera shake helper), but easy to overdo. Worth picking up only after Tier A is done and we know what feels under-supported.

## Out of scope (don't drift here)

- **Real game systems** — Q21 locks "no real-time win/lose mechanics; heartless and drives are flavor." Combat in B6 stays *narrative*, not balanced. No DPS tracking, no health pools that matter, no win conditions.
- **Asset rework** — keep the painterly hi-res keybladers + 32×32 pixel-art Heartless mix per Q15 (which already diverged from spec — don't re-open). New animations layer on top of the existing sprite sheets where possible.
- **New input verbs** — six is locked (Q1). This plan only changes the *visual response* to existing verbs.
- **Multi-wielder world choreography** — when several wielders share a repo, they currently coexist on the same iso plane. Coordinated behavior (synchronized attacks, party formations) is interesting but Phase 2C territory. Out of scope.
- **AI-generated cutscenes / cinematics** — too gamey, breaks the "ambient watch room" tone.

## Recommended v1 set

Ship **Tier A in full** (5 items, ~2–2.5 days total). It's the cheapest path from "screensaver" to "alive," and it unlocks a richer canvas without committing to combat semantics. Tier B can land item-by-item afterwards based on what still feels missing.

In rough order of impact:
1. **Tier A #1 (per-tool VFX)** — biggest legibility win; agent activity becomes readable from across the room
2. **Tier A #5 (letter↔canvas color flash)** — closes the chat-vs-canvas-feel-disconnected gap
3. **Tier A #2 (idle quirks)** — biggest archetype-personality win
4. **Tier A #4 (world breath)** — ambient sense of "the kingdom is alive"
5. **Tier A #3 (streak success/fail pose)** — small but adds emotional texture

## Edge cases / gaps to handle

- **Many wielders in one world** — Tier A #1 effects shouldn't pile up visually if 3 wielders all `tool_use` at once. Cap simultaneous overlays per world (e.g., max 3 visible; rest skipped that frame).
- **Renderer perf budget** — Tier A adds 5 new FX sources. Keep particle counts modest; reuse pools. The Tier 1 + 2 + 3 shader stack already eats GPU; profile if frames drop below 60.
- **Sound coupling** — each VFX trigger should fire its existing SFX cue (already covered by `synth.ts` + the `tool` / `edit` / `bash` etc. names in `SoundName`). Avoid stacking overlapping cues.
- **Asset pipeline** — new VFX overlays + idle quirks are new sprite-sheet work. Use the existing `scripts/generate-pixel-sprites.ts` pattern; can also AI-generate per the keyblader pipeline. Authored separately, drop into `assets/sprites/kh-default/`.

## Sequencing with other plans

- Independent of `chat-drawer.md` and `observed-resume.md`
- Cheap to interleave — Tier A items each ship in <½ day, can sneak in between bigger features
- Pairs naturally with **Quest system** (vision.md backlog) — quest start/complete moments are exactly the kind of canvas-storytelling beats Tier A is building scaffolding for
- Should land **before** any wider distribution — first impressions matter, and "bleak" is the wrong opening note
