# Renderer

The renderer is one Electron window with **two coexisting rendering systems**:

- **Phaser 4 canvas** — the Kingdom scene (worlds, wielders as sprites, atmospheric layer)
- **DOM React 19** — HUD, floating panels, conversation streams, settings

Both share state through a single Zustand store (`src/renderer/src/store.ts`). The Phaser scene reads from it via subscription; React components read via hooks.

## Layer stack (bottom to top)

```
0. <canvas>            — Phaser KingdomScene (one big z-layer)
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

## HUD widgets (`src/renderer/src/ui/hud/`)

| File | Where | Purpose |
|---|---|---|
| `KingdomHeader.tsx` | top-center | Kingdom name + status pill |
| `WielderHUD.tsx` | top-left | Live party roster |
| `AlertsHUD.tsx` | top-right | Permission letters, important alerts |
| `LettersHUD.tsx` | bottom-right | Notable / non-blocking letters |
| `PartyRow.tsx` | inside WielderHUD | Per-wielder row in the roster |
| `LetterCard.tsx` | shared | One letter card, used by both AlertsHUD and LettersHUD |
| `HudWidget.tsx` | shared | Collapsible chrome (header + body, click to toggle) |
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
| `KingdomPanelBody.tsx` | Tabbed kingdom-wide view |
| `SettingsPanelBody.tsx` | App settings UI |
| `ChatDrawer.tsx` | Right-edge tabbed conversation drawer (singleton) |

## Conversation rendering (`src/renderer/src/ui/ConversationStream.tsx`)

The chat stream renders `AgentEvent`s into one of:

- **User prompt bubble** — markdown-rendered (KCL Streamdown), gold-edge styling
- **Tool use card** — collapsible, terse-by-default for Read/Edit/Write/MultiEdit/NotebookEdit
- **Tool result block** — terminal-style for Bash, diff for Edit/MultiEdit/Write, plain text otherwise
- **Permission marker** — inline, click to spotlight the letter card
- **Subagent spawn marker** — indented child events
- **Error banner** — red tint, exit code chip

Streamdown plugins enabled: `code` (Shiki), `mermaid`, `math` (KaTeX), `cjk`. Markdown element styling is owned through `ConversationStream` component mappings instead of global `.md*` CSS. Mermaid's overlay leaks z-index; floating-panel zCounter starts at 10000 to clear it.

## Activity log (`src/renderer/src/ui/ActivityLog.tsx`)

Bottom-left, one-line summaries across all wielders. Click routing:

- `tool_use` / `tool_result` / `assistant_text` / `user_prompt` / `error` → open a chat-drawer tab for the wielder, scroll to that timestamp
- `permission_request` → highlight the matching alert card in AlertsHUD (silent fail if already resolved)
- `session_start` / `session_end` / `subagent_spawn` / `permission_resolved` → not clickable (system markers)

## Streamdown plugin set

Dependencies: `streamdown` + `@streamdown/{code,mermaid,math,cjk}` + `katex`.

We initially tried trimming mermaid+math after observing the z-index leak, but their removal broke other rendering (paragraph wrapping). Kept all four plugins; addressed the overlay via panel z-counter bump. Documented in commit history.

## Audio (`src/renderer/src/audio/`)

Three files, all renderer-side:

| File | Purpose |
|---|---|
| `sounds.ts` | Probes `/sounds/kh/{name}.{ext}` (wav/mp3/ogg) for each `SoundName`. Falls back to `synth.ts` synthesized cues when no real audio file is present. |
| `synth.ts` | Tiny Web Audio synth — 1–3 oscillator bursts with envelopes, ~30–250ms. Default cues out of the box. |
| `music.ts` | Background chiptune loop (Aeolian arpeggio, the "Dearly Beloved" cadence) at very low volume. Auto-starts on first user interaction (browsers gate `AudioContext` on user gesture); pauses when window is hidden. |

`SoundName` set: `tool, edit, bash, web, summon, session_start, session_end, world_warp, error, select, seal, ko, drive, comfort, letter`. To add a sound, drop a file into `assets/sounds/kh/` (built into `out/renderer/sounds/kh/` at build time) — no code change required, the loader probes for it.

Mute toggle is shared between `sounds.ts` and `music.ts` via `isMuted()` — single source of truth.
