# Renderer

The renderer is one Electron window with **two coexisting rendering systems**:

- **Phaser 4 canvas** — the Kingdom scene (worlds, wielders as sprites, atmospheric layer)
- **DOM React 19** — HUD, floating panels, conversation streams, settings

Both share state through a single Zustand store (`src/renderer/src/store.ts`). The Phaser scene reads from it via subscription; React components read via hooks.

## Layer stack (bottom to top)

```
0. <canvas>            — Phaser KingdomScene (Star Chart + tactical map)
1. .hud-top-left/-right/-center/.hud-bottom-* — HUD widgets (DOM, fixed)
2. .floating-panel-layer  — draggable panels (modals, wielder cards)
3. .decree-modal       — full-screen letter modal (highest)
```

## Phaser bridge

`src/renderer/src/game/PhaserGame.tsx` mounts one Phaser game with the canvas inside a parent div, then wires:

- `ResizeObserver` on the parent → `game.scale.resize(w, h)` (CSS grid reflow needs this — `window.resize` alone misses container changes)
- DEV-only `__phaser` global on `window` for debugging
- Cleanup on unmount: `game.destroy(true)`

The active scene is `KingdomScene` (`src/renderer/src/game/scenes/`). Per the Q40 decision in vision.md, there's just one unified scene — no per-world scene switching.

The scene also owns the bottom-center tactical map. It renders through a
separate HUD camera so it stays pinned to the viewport while the main camera
pan/zooms the world. The tactical viewport rectangle uses the same safe-area
insets as camera fitting, so it represents the visible gameplay window between
the DOM HUD panels rather than the full canvas. Clicking a world marker selects
that world; clicking/dragging empty tactical-map space pans the Star Chart.
For the selected world, Phaser also publishes a screen-space anchor into the
Zustand store. React uses that anchor to render `WorldCommandHUD` as a clamped
contextual popover emerging from the world instead of as a fixed screen bar.

## HUD widgets (`src/renderer/src/ui/hud/`)

| File | Where | Purpose |
|---|---|---|
| `KingdomHeader.tsx` | top-center | Kingdom stats plus a live situation chip that cycles focus through pressured, held, and active worlds |
| `WielderHUD.tsx` | top-left | Live party roster |
| `AlertsHUD.tsx` | top-right | Permission letters, saved-rule choices, important alerts |
| `LettersHUD.tsx` | bottom-right | Notable / non-blocking letters |
| `WorldCommandHUD.tsx` | selected world | Contextual selected-world command popover with focus / dispatch / seal and clickable mission-line agents |
| `PartyRow.tsx` | inside WielderHUD | Per-wielder row in the roster |
| `LetterCard.tsx` | shared | One letter card, used by both AlertsHUD and LettersHUD |
| `HudWidget.tsx` | shared | Collapsible HUD shell (header + body, click to toggle) |
| `hud-prefs.ts` | shared | `usePersistedBool` — collapse state persisted in localStorage |

HUD widgets do NOT close on outside click — collapse only on header click. (Different from floating panels, which can be dismissed.)

## Floating panels (`src/renderer/src/ui/floating/`)

State lives in `panel-store.ts`:

```ts
type Panel = {
  id: string;          // `${kind}:${key}` — singletons use a fixed key
  kind: "wielder" | "settings" | "kingdom" | "dispatch";
  title: string;
  x: number; y: number;
  width: number;
  height?: number;     // null = auto-fit (default); set for fixed-height bodies
  z: number;
  data?: unknown;      // panel-kind-specific (e.g. {initialTab, scrollToTs})
};
```

- `zCounter: 10_000` (high to clear Mermaid's overlay z-index);
  `--z-modal` and `--z-popover` intentionally sit above that range so
  Radix dialogs, alert dialogs, menus, and tooltips clear open panels.
- Singletons (settings, kingdom, dispatch) only ever have one open instance
- Wielder panels keyed by `unit.id` — opening the same wielder twice raises the existing one
- `setSize(id, {width, height})` lets a body call up and resize itself

`FloatingPanel.tsx` handles drag and focus-on-click (raise z).

The right-edge `ChatDrawer` is a separate singleton (not in the panel array). It owns its own slice of `panel-store` (`drawer.openTabs`, `activeTab`, `width`, `minimized`, `z`) and shares `zCounter` with floating panels for click-to-focus stacking.

| Body | Purpose |
|---|---|
| `WielderPanelBody.tsx` | Per-wielder Status card (portrait + bars + verbs); chat verb opens a drawer tab |
| `DispatchPanelBody.tsx` | Spawn a new wielder (tool + repo + prompt) |
| `KingdomPanelBody.tsx` | Tabbed kingdom-wide view; Overview ranks live fronts from the shared realm situation model |
| `SettingsPanelBody.tsx` | App settings UI |
| `ChatDrawer.tsx` | Right-edge tabbed conversation drawer (singleton) |

`src/renderer/src/game/realm-situation.ts` is the shared read model for
kingdom-wide prioritization. It derives each world's pressure / hold / active /
calm / sealed state through the same `createWorldCommandBrief` logic used by
the selected-world command HUD. React consumers must use this model rather
than introduce a separate game-only interpretation of provider state.

The canvas state labels, traffic accents, and tactical markers also use that
brief (cached once per world per frame). Unresolved permission/input letters
therefore remain holds after transient event effects expire. This is the Realm
presentation model, not a replacement for main-process Monitor reconciliation.

The Realm uses an original pearl/indigo dream-fantasy ground plate, with live worlds
assigned to six authored courtyards by the pure `game/realm-terrain.ts` model.
`game/realm-landmarks.ts` places six transparent building frames independently
above that ground. Building scale (0.78) is independent of terrain scale (1.35)
and preserves existing character artwork and sizing. Its pure courtyard-slot
helper stages both working and resting agents south of the building footprints;
idle patrols stay near those slots. Scenery is decorative, not monitoring state.
Asset generation prompts and limitations live in `assets/environments/DREAM-ART.md`.

Session activity sites use the pure `game/session-activity.ts` presentation model:
one identity per observed unit, never inferred task titles or progress. Unresolved
session-scoped asks override activity; nonterminal signals older than two minutes
read as stale. Session end is not task completion. `ActivitySiteLayer` owns crystal
console markers and click targets, synchronizes at 4 Hz, and cleans up on removal
and scene shutdown. Working choreography stops for blocked/stale sites. React's
`SessionActivityCard` exposes the same evidence, freshness, and parent-session link
inside the existing inspector; controls still use existing capability-gated flows.
Explicit run sites are separate: `game/run-sites.ts` projects existing durable
orchestration records without creating tasks from tool activity. Exact repository
context places runs in districts; only provider-native session links (provider +
session ID) or an explicit standing-order unit target identify participants.
Ambiguous/unrepresented repository placement is left unmapped. `RunSiteLayer`
shows up to three runs per district, prioritizing active work; the district HUD
lists all associated runs. `RunSitePanelBody` shows authoritative lifecycle,
recorded steps, blockers, and participant links, and reuses the existing Run board
for controls. Source failures show unavailable rather than presenting retained
records as live. Run and session inspectors link in both directions. No numeric
task progress is inferred from step counts. Workstation routing and terrain-aware
pathfinding remain unimplemented. The minimap composites landmark frames using
the same scale/origin manifest as the main scenery.
React's settlement description and Phaser's placement use this same model.
More than six worlds allocate additional regions; regions currently reuse the
same artwork. Only live worlds receive status labels and selectable markers.
The camera fills the viewport with terrain at every zoom, including ultrawide
displays. The screen is a window into the landscape, not a framed picture of
the whole map. Bounds prevent panning into empty space; the minimum zoom covers
both viewport dimensions. Some scenery is naturally off-screen and reached
by panning or the minimap. Wheel zoom preserves the world point beneath the
pointer, subject to terrain bounds, and cancels any in-flight camera pan/zoom.
The React `Recenter realm` button emits the renderer-only event defined in
`game/realm-framing.ts`; the scene removes its listener on shutdown.
The single-region tactical map shows the terrain beneath its live markers.
Compact HUD is the default: roster, activity, and informational letters start as
small expandable strips. Their temporary peeks do not overwrite the expanded
layout's saved collapse preferences. Alerts retain their existing preference
and default to expanded, keeping permissions prominent. Collapsed bodies are
inert so hidden controls cannot receive keyboard focus. Character sprites and
animations are unchanged. Garden lights are decorative, not agent signals.
Terrain activity captions use a deterministic collision layout: blocking asks
and review states retain their anchors; overlapping secondary captions move
downward. Quiet overview views hide secondary captions, names, and bars unless
selected (critical health remains visible). Close views restore names and bars.
Legacy order badges are suppressed on terrain to avoid repeating the activity
caption, and party banners are selection-only. Workstation contact shadows are
scene-owned decorative shapes and are destroyed with their session markers.
Agents and workstation props are directly clickable, even when their labels
are hidden at overview zoom. A left-button release with less than six pixels
of movement inspects the session; dragging continues to pan without inspection.
Hovering a workstation or its caption reveals that caption. These entry points
share `ui/inspect-realm-agent.ts` and never issue operational commands.
`NextRealmAsk` cycles only sessions with unresolved blocking letters, reuses
the existing camera target and inspector, and never approves a request.
The optional Realm guide explains navigation and the world/session/run mapping.
Reviewing a blocking ask explicitly expands Alerts before focusing it.
The old procedural islands remain a missing-texture fallback, not the primary
art direction. Terrain is a flat pre-rendered layer: building occlusion and
terrain-aware pathfinding are not implemented by this change.
The Electron map smoke test exercises the command-panel close button with both
HUD lanes present and captures settlement/overview images for visual inspection;
these captures are not pixel-diff baselines.

## Courtyard movement and physical depth

`courtyard-route.ts` defines local column approaches and a south-side aisle
between workstation columns. It is not a full-map pathfinder: terrain district
relocation is atomic; the legacy star chart retains direct travel. Destination keys
include formation coordinates, so changed slots retarget movement. Removed
agents cancel their tweens; failed sessions stop in place; arrival callbacks
read current session state rather than a captured status.

`courtyard-seating.ts` reserves stable, unique seats across active and resting
agents before allocating new arrivals. Terrain formations no longer wrap at six
agents. Rows are 44 world pixels apart. `district-overflow.ts` maps every twelve
seats onto an authored courtyard; additional courtyards occupy dedicated terrain
regions and remain part of the original project. Labels identify annex ownership
and occupancy, and minimap markers support click-to-pan. Cross-region placement
is an immediate visual relayout, never an invented walk over water. Local
movement still follows the courtyard aisle. Selected-agent focus reaches its
actual courtyard, including annexes. On a world-set change, the scene captures
old home and annex origins, moves district anchors immediately, cancels obsolete
actor tweens, and translates actors by their courtyard's displacement. Failed
sessions retain their local stopped position rather than being left over water.
No session state or character art changes during this relayout.

The district terrain plate preserves the original dimensions and courtyard
anchors, with road exits at each edge midpoint. Six quieter landscape treatments
(amber rock gardens, indigo hedges, canals, lilac groves, silver-blue gardens,
and tide pools) distinguish local districts. Water borders replace cliffs cut by
tile edges. `TerrainJoinLayer` softens internal boundaries using mirrored 8-source-pixel
strips that fade to half opacity at the join. It owns and cleans up these images;
the strips do not change navigation or agent placement. Full terrain images must
explicitly use the `__BASE` frame because registering named strip frames changes
Phaser's default frame. Electron coverage checks every expanded tile's dimensions
and frame, samples live relayout across animation frames, and captures both road
crossings and four-region junctions. The plate
still repeats, and the blended joins are not pixel-perfect seamless terrain.

Electron fixtures cover 30 agents across projects and 30 in a single project,
stable seats through status changes and replacement, failed-agent arrival,
unresolved asks in every annex, and compact-window inspection. The Phaser debug
reference is available only in development or explicitly E2E-gated windows.

Agents, buildings, courtyard furniture, and workstation props share a
foot-Y-sorted ground-object container. Regional scenery ownership handles
visibility and cleanup without introducing a nested render group that would
prevent interleaving. Trees baked into the terrain image are not yet separate
occluders.

`courtyard-terrace.ts` places flat oval painted paving below physical scenery,
with visibility and destruction owned by the regional landmark controller.
The paving uses linear texture filtering and broad, restrained inlay rather
than raised octagonal slabs. Its 356 × 258 footprint remains unchanged.
Workstation props are smaller than decorative edge furniture and face outward
from the courtyard's center aisle, based on the stable local seat index. Neither
change resizes characters or introduces navigation geometry. Work positions use
two staggered wings with a clear central approach; a seat's coordinates do not
depend on current occupancy or status (resting retains the same column). Rear
paving extends beneath building entrances. Six fixed edge-furniture compositions
differentiate landmarks without implying provider activity.

Travel effects and monitoring labels remain separate overlays. District
nameplates follow world positions below the walking aisle; activity caption
layout reserves their bounds. Selected/hovered identities are consolidated into
activity captions; redundant character-name and party banners are hidden in the
terrain view. Healthy bars are selection-only. These visual routes and layers
never dispatch work or alter provider session state.

Map inspection clicks require a short primary gesture whose press and release
both target the canvas (`canvas-click.ts`). This prevents window-level release
events from React HUD controls or inspector close buttons selecting scenery
behind the overlay. It applies to characters, districts, activity props/captions,
and run-site labels.

Districts with more than six agents suppress routine activity captions until
hover/selection. Urgent captions are never suppressed by density or zoom;
bounded inverse scaling keeps text near 12 screen pixels at ordinary overview
zoom (0.3–1.2), and collision placement uses the scaled label bounds.
The tactical map's screen rectangle is projected back into world coordinates
as a caption obstacle, so urgent text clears it through pan and zoom.
Workstation props and character inspection remain available for every agent.

Courtyard paving uses six district-specific frames from
`realm-dream-courtyards-integrated.png`: workshop, archive, crossroads, garden, observatory,
and waterfront. Flat scenery keeps the same 356×258 footprint, position, seat
coordinates, and ground-only depth. Recessed silhouettes retain a continuous
original paving underlay; the original image is also the missing-atlas fallback.
All surfaces are region-owned and share visibility/cleanup. The atlas uses
linear environment filtering independently of character textures. Collapsed
non-alert HUD panels use cooler, quieter chrome without concealing controls.

The integrated atlas retains the original grid and replaces framed perimeter
ornaments with irregular stone and low planting. Previous atlas art is retained.
`landmark-grounding.ts` paints three low-opacity contact lobes per building on
one static regional Graphics object at depth -59, above paving but below actors.
Its visibility and destruction follow regional scenery ownership. Decorative
furniture alone uses a 0.9 scale multiplier and cooler tint; interactive stations
and all character textures, positions, scale, and input remain unchanged.

`station-feedback.ts` derives restrained prop feedback from observed activity:
fresh working agents pulse only while settled at their station; blocked/error
states use steady amber/rose tint, and stale/quiet stations dim. An observed
working-to-ended transition receives a 1.4-second mint acknowledgement and
caption, never a success claim. Hydrated ended sessions do not replay it.
Feedback uses the existing scene sync with no extra timers or tweens; removing
a marker discards its transition history. Terrain session endings no longer
scale characters. Character hover reveals the same caption as workstation
hover. Inspection shows district context, explicitly linked runs (or the lack
of one), and a shared focus action without dispatching provider commands.

Terrain emphasis uses observed `SessionActivity`: only selection (cyan) and
attention (amber) receive strong, steady foot rings. Routine order trails and
idle flourishes are suppressed; work flourishes are selected-working-only.
Selection uses the same store identity as the inspector. Caption placement
gives the selected agent first priority, then urgent agents, then hover and
routine captions. Foot-ring stroke width compensates for overview zoom (capped
at 2.5×), without changing character geometry. Explicit agent focus uses
`agent-focus.ts` to project the actor into the widest horizontal band clear of
registered floating panels and the expanded chat drawer. It respects moved
panels, does not move them, and falls back to center when no viable band exists.
World-only focus retains its existing framing; normal selection and background
events do not trigger camera movement. Camera world bounds still apply.
Caption placement
searches beside, above, and below obstacles, reserves live character silhouettes, and
draws a thin leader when a caption must move away from its anchor. Urgent
captions are retained even when crowded; labels can still extend away from a
fully occupied court rather than concealing a blocker.

## Conversation rendering (`src/renderer/src/ui/ConversationStream.tsx`)

The chat stream renders `AgentEvent`s into one of:

- **User prompt bubble** — Streamdown-rendered markdown, gold-edge styling
- **Tool use card** — collapsible, terse-by-default for Read/Edit/Write/MultiEdit/NotebookEdit
- **Tool result block** — terminal-style for Bash, diff for Edit/MultiEdit/Write, plain text otherwise
- **Permission marker** — inline, click to spotlight the pending letter card
- **Subagent spawn marker** — indented child events
- **Error banner** — red tint, exit code chip

Streamdown plugins enabled: `code` (Shiki), `mermaid`, `math` (KaTeX), `cjk`. Markdown element styling is owned through `ConversationStream` component mappings instead of global `.md*` CSS. Mermaid's overlay leaks z-index; floating-panel zCounter starts at 10000 to clear it.

## Activity log (`src/renderer/src/ui/ActivityLog.tsx`)

Bottom-left, one-line summaries across all wielders. Click routing:

- `tool_use` / `tool_result` / `assistant_text` / `user_prompt` / `error` → open a chat-drawer tab for the wielder, scroll to that timestamp
- `permission_request` → highlight the matching alert card in AlertsHUD (silent fail if already resolved)
- `permission_resolved` → saved-rule auto-resolution audit row; not clickable
- `session_start` / `session_end` / `subagent_spawn` → not clickable (system markers)

## Streamdown plugin set

Dependencies: `streamdown` + `@streamdown/{code,mermaid,math,cjk}` + `katex`.

We initially tried trimming mermaid+math after observing the z-index leak, but their removal broke other rendering (paragraph wrapping). Kept all four plugins; addressed the overlay via panel z-counter bump. Documented in commit history.

## Audio (`src/renderer/src/audio/`)

Three files, all renderer-side:

| File | Purpose |
|---|---|
| `sounds.ts` | Probes `/sounds/rw/{name}.{ext}` (wav/mp3/ogg) for each `SoundName`. Falls back to `synth.ts` synthesized cues when no real audio file is present. |
| `synth.ts` | Tiny Web Audio synth — 1–3 oscillator bursts with envelopes, ~30–250ms. Default cues out of the box. |
| `music.ts` | Background chiptune loop with a soft modal arpeggio at very low volume. Auto-starts on first user interaction (browsers gate `AudioContext` on user gesture); pauses when window is hidden. |

`SoundName` set: `tool, edit, bash, web, summon, session_start, session_end, world_warp, error, select, seal, ko, aura, comfort, letter`. To add a sound, drop a file into `assets/sounds/rw/` (built into `out/renderer/sounds/rw/` at build time) — no code change required, the loader probes for it.

Mute toggle is shared between `sounds.ts` and `music.ts` via `isMuted()` — single source of truth.
