# Sprite Generation Prompts

Generate sprites for the **four original keyblade-wielders** keykeeper
uses. Each agent run is hashed to one of the four archetypes via
`(tool, repoRoot)`, so any active world rotates through all four
visuals. The wielders:

- **Vaelen** — Guardian of Twilight (male, twilight purple) → `keyblader1`
- **Selene** — Dreamweaver (female, dream-petal pink) → `keyblader2`
- **Ryder** — Warden of Iron (male, forge orange/iron) → `keyblader3`
- **Lyris** — Wanderer of the Sea (female, tide cyan/sea) → `keyblader4`

All four are your original designs, not based on any copyrighted IP.

Each character needs **one 32-frame sprite sheet** covering every
animation state the game uses (idle in 3 directions, walk in 3
directions, attack, special). That single sheet drops into
`assets/sprites/kh/` and replaces the procedural defaults.

---

## The characters

### Vaelen — Guardian of Twilight (male)

Spiky black hair, sharp blue eyes, fair skin. Long dark navy coat with
purple inner lining and gold trim, asymmetric collar. Black armored
gauntlets with gold accents. Dark navy pants tucked into knee-high
black boots with gold ankle buckles. Subtle silver chain hanging from
left shoulder. Carries the **Noctis Rayle**: a long keyblade with a
spiked dark-purple guard, silver-and-violet blade with crystal facets,
and a small chain charm with a purple gem.

Element: **twilight purple** trail on attack/special.

Palette (8 colors): Twilight Purple `#3a2870`, Shadow Violet
`#5a3878`, Dusky Lavender `#7a6890`, Moon Silver `#b0b0c0`, Royal Gold
`#d8a830`, Bronze Accent `#8a5828`, Deep Charcoal `#2a2a2a`, Void
Black `#0a0a0a`. Skin tones (`#f0d0a8` light / `#c89878` shadow)
allowed in addition.

### Selene — Dreamweaver (female)

Long pale-pink hair flowing past shoulders, soft amber eyes, fair
skin. Layered white-and-lavender robes with silver belt and pink sash.
Open-toed sandals with silver wraps up the calves. Lotus-shaped silver
brooch at chest. Slim build. Carries the **Lunaflower**: a graceful
keyblade with a lotus-flower guard, silver-and-pink blade etched with
moon symbols, and a small lotus charm.

Element: **dream-petal pink** trail on attack/special.

Palette (8 colors): Petal Pink `#f0c0d8`, Lotus Lavender `#c8a0d0`,
Soft Cream `#f8e8d0`, Moonlit White `#fafaf5`, Silver `#b8b8c8`,
Rose Accent `#a85878`, Twilight Indigo `#503870`, Charcoal `#3a3030`.
Skin tones (`#f8d8b8` light / `#c8a088` shadow) allowed in addition.

### Lyris — Wanderer of the Sea (female)

Shoulder-length wavy teal hair pulled half-back with a small silver
clasp, sea-green eyes, lightly tanned skin. Sleeveless cyan tunic
layered over a fitted white undershirt, silver pauldron on the left
shoulder, navy sash tied at the waist. Loose teal trousers tucked
into knee-high white wrap-boots. A small conch-shell pendant hangs at
the throat. Athletic build, light on her feet. Carries the
**Tidebreaker**: a flowing keyblade with a curved wave-shaped guard,
white-and-cyan blade etched with tide patterns, and a small
seashell charm at the chain.

Element: **cyan water arc** trail on attack/special — a curved
crescent of liquid pixels with droplet sparkles on the attack peak,
and a swirling tide ring around the feet on cast peak.

Palette (8 colors): Tide Cyan `#5cc8d8`, Deep Teal `#2a7088`, Sea
Foam `#c8e8e8`, Pearl White `#f8f8f0`, Storm Navy `#203848`, Coral
Accent `#e09078`, Silver `#b0b8c0`, Charcoal `#202830`. Skin tones
(`#e8c098` light / `#a07858` shadow) allowed in addition.

### Ryder — Warden of Iron (male)

Short tousled copper hair, sharp amber eyes, sun-weathered skin with a
small scar over the right brow. Heavy crimson cloak with a high
collar over a dark-grey utility tunic, iron-plated bracers on both
forearms, a leather belt with a brass buckle. Reinforced grey trousers
tucked into iron-toed brown boots. A small gear-shaped iron charm
hangs at the belt. Stocky, broad-shouldered build. Carries the
**Gearbound**: a heavy keyblade with a circular gear-ring guard,
copper-and-iron blade with riveted plating, and a small cog charm at
the chain.

Element: **orange-gold ember spark + iron sheen** trail on
attack/special — the attack peak shows a curved arc of molten sparks
with smoke wisps, and the cast peak is a ring of orbiting gear
fragments around the character.

Palette (8 colors): Forge Orange `#e07028`, Copper `#a85838`, Iron
Grey `#586068`, Steel Highlight `#9098a0`, Crimson Cloak `#883028`,
Brass Accent `#c89040`, Soot Black `#181818`, Bone White `#e8e0d0`.
Skin tones (`#e0b890` light / `#a07050` shadow) allowed in addition.

---

## The 32-frame layout

Single horizontal sheet, **32 frames at 96×144 each = 3072×144 total**
PNG. Transparent background. Every frame identical dimensions,
character horizontally centered, feet anchored at the same y across
all frames.

### Why 96×144 native

Pixel art is **resolution-locked**. If the AI generates at 200+ px per
frame and we downscale to 96×144 at import time, nearest-neighbor
drops pixels arbitrarily — characters lose edge detail and a "noisy"
look creeps in.

The fix is to author at the _exact_ size the game renders. Phaser
shows the sprite at integer scale (1×, 2×, 3×) with nearest-neighbor
filtering, so a 96×144 source rendered at 1× = 96×144 on screen with
zero pixels lost.

If your image-gen tool can't honor exact dimensions, generate at any
high-res output and the extractor (`extract-32-frame-sheet.ts`) will
preserve native source resolution. The renderer then scales down at
display time — fine for placeholder, but every step away from native
authoring trades crispness.

### Frame index breakdown

| Frames    | State                            | Direction / pose                                                                                                                                      |
| --------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0–3**   | **Idle (front)**                 | Facing camera, weight on one leg, weapon at side, 1–2 px vertical breathing sway                                                                      |
| **4–7**   | **Idle (back)**                  | Facing away from camera, hair/cape/back of coat visible, breathing sway                                                                               |
| **8–11**  | **Idle (side, right-facing)**    | Profile view, weapon held at side, breathing sway. Game mirror-flips for left.                                                                        |
| **12–15** | **Walk (down — toward camera)**  | 4-step cycle: left foot forward → both feet down → right foot forward → both feet down                                                                |
| **16–19** | **Walk (up — away from camera)** | 4-step cycle, back view of the character moving away                                                                                                  |
| **20–23** | **Walk (side, right-facing)**    | 4-step profile walk, weapon swings naturally with stride. Game mirror-flips for left.                                                                 |
| **24–27** | **Attack**                       | Front 3/4 view: windup (weapon raised) → strike (weapon mid-swing) → peak (weapon extended, full elemental trail visible) → recovery (weapon lowered) |
| **28–31** | **Cast / special**               | Front view: charge (weapon raised, magic gathering) → release (energy bursting) → peak (full aura around character) → recovery                        |

### Movement details for the walk cycles

The 4-frame walk needs to read as a real cycle:

- **Frame 0 of the cycle**: contact pose — foot just landed, weight transferring
- **Frame 1**: pass pose — feet aligned, body at lowest point
- **Frame 2**: contact pose — opposite foot just landed
- **Frame 3**: pass pose — feet aligned, body at lowest point

Body bobs vertically by 1–2 px between contact and pass frames so it
doesn't slide.

### Effect details for action frames (24–31)

- **Frame 26 (attack peak)**: weapon trail —
  - **Vaelen**: curved twilight-purple crescent with small star-like
    sparkles trailing the blade.
  - **Selene**: swirl of pink dream-petals trailing the blade.
  - **Lyris**: cyan water crescent with droplet sparkles flicking off
    the swing arc.
  - **Ryder**: orange-gold ember arc with smoke wisps drifting behind
    the swing.
- **Frame 30 (cast peak)**: full-body aura —
  - **Vaelen**: violet ring radiating outward with star pinpricks.
  - **Selene**: pink lotus bloom expanding around the feet.
  - **Lyris**: swirling cyan tide ring spiraling around the feet.
  - **Ryder**: copper/iron gear fragments orbiting the character at
    waist height.

---

## Single prompt — generate one character's full 32-frame sheet

Paste this once per character (substitute the bracketed sections).

```
Generate a 32-frame horizontal sprite sheet for an original RPG
character. ONLY the animation frames — no portrait, no weapon detail
card, no palette swatches, no labels, no frame numbers.

OVERALL CANVAS — AUTHOR AT EXACT TARGET RESOLUTION
- Single horizontal PNG at EXACTLY 3072 × 144 px (do not exceed)
- Each frame: EXACTLY 96 wide × 144 tall — identical dimensions
- 32 frames total in one row, evenly spaced (frame N starts at x=96·N)
- DO NOT arrange frames in multiple rows. DO NOT split into a grid.
  Output must be ONE SINGLE HORIZONTAL STRIP only.
- DO NOT include a checkerboard preview background, transparency
  pattern, color swatches, frame numbers, labels, borders, or any
  metadata. The PNG itself carries transparency via its alpha channel.
- Background: fully transparent (alpha 0) — NOT white, NOT navy,
  NOT a checkerboard
- Character horizontally centered in each frame
- Feet anchored at the same y-coordinate across all 32 frames

The character must fit within ~64 px wide and ~120 px tall to leave
room for the weapon swing and aura on attack/cast frames. Do NOT
upscale a higher-resolution sprite — pixel art is resolution-locked,
authoring at the target size keeps it crisp at game render scale.

STYLE
- 16-bit JRPG pixel art (Final Fantasy Tactics / Suikoden / Octopath
  Traveler quality)
- Standard human proportions (5–6 heads tall), NOT chibi
- Clean 1-pixel outlines around every silhouette
- Three-tone shading per region (base + highlight + shadow)
- 8–12 deliberate colors per character (use the palette below)
- Hand-placed pixels: NO anti-aliasing, NO gradients, NO blur
- Sharp pixel-perfect edges, integer pixel positions

FRAME LAYOUT (left to right)

Frames 0–3   IDLE FRONT
  Character facing camera, relaxed battle stance, weapon at right
  side. Frames near-identical with subtle 1–2 px vertical breathing
  sway. Same pose, slightly different vertical offset.

Frames 4–7   IDLE BACK
  Character facing AWAY from camera (back view). Show hair flow,
  back of coat / cape / robe details, weapon visible at right side.
  Same breathing sway pattern as front idle.

Frames 8–11  IDLE SIDE (right-facing)
  Profile view, character facing the right edge of the frame.
  Weapon held at the right side. Same breathing sway.
  (The game will mirror-flip these for left-facing.)

Frames 12–15  WALK DOWN (toward camera)
  4-step walk cycle, character striding toward camera:
  12 = left foot just landed (contact pose)
  13 = both feet aligned, body at low point (pass pose)
  14 = right foot just landed (mirror of 12)
  15 = both feet aligned, body at low point (pass pose)
  Body bobs 1–2 px between contact and pass.

Frames 16–19  WALK UP (away from camera)
  4-step walk cycle, character striding AWAY (back view):
  Same contact / pass / contact / pass pattern as walk down.

Frames 20–23  WALK SIDE (right-facing)
  4-step profile walk, character moving toward right edge of frame:
  Weapon swings naturally with stride. Hair/cape trails behind
  slightly. Same contact / pass cadence.

Frames 24–27  ATTACK (front 3/4 view)
  24 = windup: weapon raised overhead, body coiled back
  25 = strike: weapon mid-swing forward, body twisted into the swing
  26 = peak: weapon fully extended forward, FULL ELEMENTAL TRAIL
       visible behind the swing arc, sparkle particles
  27 = recovery: weapon lowered, body unwinding back to stance

Frames 28–31  CAST / SPECIAL (front view)
  28 = charge: weapon raised, both arms gathering magic, ground
       particles starting to rise around feet
  29 = release: arms extended outward, energy bursting from weapon,
       aura starting to expand
  30 = peak: full elemental aura ring around the character, weapon
       glowing brightly, particles at maximum
  31 = recovery: weapon lowered, aura dissipating into wisps

CHARACTER

[paste one of the four character descriptions above (Vaelen, Selene,
Lyris, or Ryder), including the full palette]

Output: one PNG, 3072×144, transparent background, original character
design (no IP copies), no watermarks or text overlays.
```

## Iteration / refinement prompts

If the first generation has problems, run these against the same
character:

### Sharpen + lock dimensions

```
Refine this 32-frame sprite sheet. Goals:
1. KEEP all character design and palette unchanged.
2. Sharpen pixel edges — remove anti-aliasing, snap to integer grid.
3. Ensure all 32 frames are exactly 96×144 with feet at the same y.
4. Tighten 1-pixel outlines around every silhouette.
5. Every pixel must come from the character's defined palette.
```

### Fix walk cycles

```
Refine the walk frames in this sheet. Goals:
1. KEEP all character design unchanged.
2. Walk down (12–15), walk up (16–19), and walk side (20–23) should
   each be a clean 4-step cycle: contact → pass → contact → pass.
3. Body bobs 1–2 px between contact and pass frames (do NOT slide).
4. Weapon swings naturally with the stride in walk-side.
5. Hair/cape trails slightly behind in walk-side.
```

### Strengthen action frames

```
Strengthen the attack and cast frames. Goals:
1. KEEP all character design unchanged.
2. Frame 26 (attack peak): make the elemental trail more dramatic —
   curved arc behind the swing, sparkle particles, full element color.
3. Frame 30 (cast peak): make the aura ring fully expanded around the
   character, weapon glowing, ground particles visible.
4. Frames 24, 25, 27 should clearly read as windup → strike →
   recovery (not static).
```

---

## Slot mapping

| Role         | Wielder | Sheet filename             |
| ------------ | ------- | -------------------------- |
| `keyblader1` | Vaelen  | `keyblader1_sheet.png`     |
| `keyblader2` | Selene  | `keyblader2_sheet.png`     |
| `keyblader3` | Ryder   | `keyblader3_sheet.png`     |
| `keyblader4` | Lyris   | `keyblader4_sheet.png`     |

Each agent run picks one of the four via `archetypeFor(tool,
repoRoot)` (see `src/shared/events.ts`), then a wielder name from the
matching archetype pool (`KEYBLADER1_NAMES` … `KEYBLADER4_NAMES`).
The hash is deterministic on identity, so the same wielder gets the
same archetype + name every session.

---

## Drop-in path

After your image-gen tool produces a multi-row concept page, run the
no-scale extractor for whichever wielder you regenerated:

```sh
bun scripts/extract-32-frame-sheet.ts /path/to/vaelen.png keyblader1
bun scripts/extract-32-frame-sheet.ts /path/to/selene.png keyblader2
bun scripts/extract-32-frame-sheet.ts /path/to/ryder.png  keyblader3
bun scripts/extract-32-frame-sheet.ts /path/to/lyris.png  keyblader4
```

The extractor auto-detects content rows, slices at fixed column
stride per row, pads every frame to a uniform bottom-anchored box,
and alpha-keys the backdrop. Output stays at native source resolution
— no downscale, no quality loss. The renderer scales at display time.

If a regenerated source has a different per-frame size than before,
update that role's entry in the `FRAME_DIMS` map in
`src/renderer/src/game/sprite-assets.ts` (the script prints
`frame size: WxH` after running). Otherwise Phaser will slice the
sheet at the wrong stride.

---

## License + IP

Vaelen, Selene, Lyris, and Ryder are **original characters** owned by
you (or the artist you commission). Their designs, names, and weapons
are not based on any copyrighted IP. Use freely for keykeeper. Pay
artists if you commission, respect royalty-free pack licenses if you
use those.
