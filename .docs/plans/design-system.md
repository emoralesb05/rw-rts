# Plan: Design system — Radix + Tailwind, shadcn-style owned components

**Status**: planned, not started · **Owner**: TBD · **Phase**: Post-Phase-2B polish

## Goal

Migrate keykeeper's UI to **Radix Primitives + Tailwind v4**, with a
shadcn-style **owned** component library under `src/renderer/src/components/`.
Replace as much hand-rolled CSS and behavior as possible with tokenized
utility classes + accessible primitives, while preserving the KH-themed
gamey aesthetic. We are **not** installing the shadcn CLI — we own every
component we ship.

## Why this direction

Three forces:

1. **Behavior pain** — focus traps, dropdown positioning, tooltip a11y,
   scroll lock, portals, click-outside — we hand-roll all of this and
   most of it is partial. Radix gives it for free.
2. **Tokens + variants pain** — we have 5 design tokens and zero spacing
   /radius/z scale. Hover/focus/dark variants get re-implemented per
   component. Tailwind solves this by being the scale.
3. **AI-agent productivity** — keykeeper is a tool *for* AI agents
   editing code. Tailwind + Radix is the most-trained-on combination on
   the planet; agents (and humans) onboard faster on it than on a 3430-
   line bespoke CSS file.

shadcn the *aesthetic* (clean SaaS dashboard) is wrong for keykeeper.
shadcn the *pattern* (owned components wrapping Radix, tailwind-classed)
is exactly right. We adopt the pattern, skip the package.

## Where we are today

- `src/renderer/src/styles.css` — **3430 lines** of vanilla CSS,
  organized but growing fast.
- **Tailwind v4 is already installed and wired**: `@tailwindcss/vite`
  plugin in `electron.vite.config.ts`, `@import "tailwindcss"` at the
  top of `styles.css`. Zero utility classes used in JSX yet — every
  `className` is bespoke.
- **5 design tokens** in `:root`: `--bg --line --accent --accent-2
  --text --muted`. No spacing/radius/z/motion/type scales.
- **Radix not installed**.
- **No `components/` directory** — everything lives in `ui/` (app
  surfaces) or `ui/floating` / `ui/hud` (subdirs).
- **Hand-rolled behavior** in:
  - `DecreeModal.tsx:72` — Escape close, no focus trap, no scroll lock
  - `FloatingPanel.tsx:81` — Escape close + manual z-stack focus
  - `ChatDrawer.tsx` — drag-to-resize, manual tab close, manual focus
  - `LetterCard.tsx` × 4 + 5 other places — `e.stopPropagation()`
  - `KingdomPanelBody.tsx` — manual `role="tablist"` plumbing
  - `DispatchPanelBody.tsx` — native `<select>` (the one aesthetic
    outlier)
  - Everywhere — `title=` instead of real tooltips

## Target architecture

### Tokens (Tailwind v4 `@theme` in CSS)

Tailwind v4 uses CSS-based config via `@theme`. Define tokens once in
`styles.css` and they become both utility classes (`bg-accent`,
`p-3`) and CSS vars (`var(--color-accent)`).

```css
@import "tailwindcss";

@theme {
  /* Color */
  --color-bg: #0a0e1a;
  --color-surface-1: #11172a;
  --color-surface-2: #161e36;
  --color-line: #2a3a6c;
  --color-line-strong: #3a4a8c;
  --color-text: #e6ecff;
  --color-muted: #8aa0d0;
  --color-accent: #6cc6ff;       /* cyan — primary action */
  --color-accent-alt: #ffd86b;   /* gold — accent / hero / sealed */
  --color-danger: #ff7a3c;
  --color-warning: #ffb86c;
  --color-success: #6bd6a8;

  /* Spacing scale (already what the codebase converges on) */
  --spacing: 4px;  /* unit; Tailwind generates p-1 = 4px, p-2 = 8px, … */

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
  --radius-pill: 9999px;

  /* Z-index — hoist from panel-store.ts so design + code agree */
  --z-canvas: 0;
  --z-hud: 50;
  --z-panel: 1000;
  --z-drawer: 1200;
  --z-alert: 1400;
  --z-modal: 2000;

  /* Motion */
  --ease-out: cubic-bezier(0.2, 0.8, 0.3, 1);
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;

  /* Type */
  --font-ui: ui-sans-serif, system-ui, …;
  --font-mono: ui-monospace, monospace;
}
```

### Component directory

```
src/renderer/src/components/
  primitives/                    ← thin Radix wrappers, our chrome
    Dialog.tsx                   ← wraps @radix-ui/react-dialog
    Tabs.tsx                     ← wraps @radix-ui/react-tabs
    Tooltip.tsx                  ← wraps @radix-ui/react-tooltip
    Popover.tsx
    Select.tsx
    DropdownMenu.tsx
    ScrollArea.tsx
  chrome/                        ← styled atoms with no Radix counterpart
    Button.tsx                   ← .btn / .btn.primary / .btn.ghost variants
    Card.tsx
    Pill.tsx                     ← KingdomHeader pill, tool-pill
    Chip.tsx                     ← hud-action-btn
    Bar.tsx                      ← HP/MP/FC bars
  index.ts                       ← barrel export
```

App-specific surfaces (HudWidget, ChatDrawer, FloatingPanel, the various
`*PanelBody` files) stay in `ui/` and *use* the components.

### Component conventions (shadcn-style)

Each primitive component:
- Re-exports the Radix subcomponents we use, styled
- Uses Tailwind utilities for styling, with token-backed classes
- Forwards refs and exposes `className` for surface-specific overrides
  (`cn()` helper merges defaults + caller overrides)
- Stays under ~120 lines; no hidden behavior

Example shape:
```tsx
// src/renderer/src/components/primitives/Dialog.tsx
import * as RxDialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";

export const Dialog = RxDialog.Root;
export const DialogTrigger = RxDialog.Trigger;

export function DialogContent({ className, children, ...rest }) {
  return (
    <RxDialog.Portal>
      <RxDialog.Overlay
        className="fixed inset-0 bg-bg/80 backdrop-blur-sm
                   data-[state=open]:animate-in
                   data-[state=closed]:animate-out
                   z-modal"
      />
      <RxDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "rounded-md border border-line bg-surface-1 p-5",
          "shadow-2xl z-modal min-w-96 max-w-[90vw]",
          className
        )}
        {...rest}
      >
        {children}
      </RxDialog.Content>
    </RxDialog.Portal>
  );
}
```

## Migration plan

### Phase 1 — Tokens (½ day, no behavior change)

1. Add `@theme` block in `styles.css` with the full token set.
2. Run a sweep replacing the 5 existing `--accent` / `--muted` /
   `--text` / `--line` / `--bg` definitions to point at the new token
   names (or keep both names aliased so existing CSS still resolves).
3. Lift z-index numbers from `panel-store.ts` to CSS vars; reference
   from JS via `getComputedStyle()` only where needed.
4. Document in `.docs/design/tokens.md` (new directory).

**Success**: no visual change. `bun run dev` and screenshot diffs to
prove it.

### Phase 2 — Install Radix + scaffold `components/` (½ day)

1. `bun add @radix-ui/react-dialog @radix-ui/react-tabs
   @radix-ui/react-tooltip @radix-ui/react-select`
2. Create `src/renderer/src/components/primitives/` and
   `src/renderer/src/components/chrome/`.
3. Add `src/renderer/src/lib/cn.ts` (clsx + tailwind-merge).
4. Build `Dialog`, `Tabs`, `Tooltip` as the first three primitives.
   Style with Tailwind utilities only — no entries in `styles.css`.

### Phase 3 — First migrations (1 day)

In this order (smallest blast radius first):

1. **DecreeModal → Dialog** — drop manual Escape, manual stopPropagation,
   manual modal markup. Verify keyboard nav works end-to-end.
2. **DispatchPanelBody native `<select>` → Select** — fixes the
   long-standing aesthetic outlier.
3. **KingdomPanelBody manual tablist → Tabs** — cleaner JSX, free arrow-
   key nav.
4. **Sweep `title=` attributes on HUD chips → Tooltip** — start with the
   most-hovered surfaces (party-row chat icon, KingdomHeader pill,
   action chips).

After each, delete the now-dead CSS from `styles.css`.

### Phase 4 — Build out remaining primitives on demand (ongoing)

Add when the next surface needs them:
- **Popover** — settings menu, world filter dropdowns
- **DropdownMenu** — wielder "more actions" once 5-button strip caps out
- **ScrollArea** — drawer body, activity log, conversation stream
  (custom dark scrollbar)

### Phase 5 — Chrome atoms (1 day)

Build `Button`, `Card`, `Pill`, `Chip`, `Bar` in `components/chrome/`.
Migrate the existing `.btn`, `.target-panel`, `.tool-pill`, `.hud-
action-btn`, `.bar` rules out of `styles.css`. These are touched by ~30
sites each — bulk find-replace.

### Phase 6 — Stop authoring vanilla CSS for new surfaces

Going forward, the rule is:
- New surface needs a primitive? Add it to `components/primitives/`
  (Radix-wrapped + Tailwind-styled).
- New chrome variant? Extend the matching atom in `components/chrome/`.
- One-off layout for an app surface? Tailwind utilities inline in the
  surface component.
- `styles.css` only grows for global concerns (tokens, base resets, the
  Phaser canvas chrome, complex animations Tailwind can't express
  cleanly).

### Phase 7 (optional) — Migrate load-bearing custom components

`HudWidget`, `FloatingPanel`, `ChatDrawer` are working. They use complex
CSS (animated `grid-template-rows: 1fr ↔ 0fr`, custom z-stack, drag-
to-resize). Migrate **only if** day-to-day friction warrants — not for
purity. Likely outcome: keep the animation CSS in `styles.css`, move
typography / spacing / colors to Tailwind utilities, leave the bones
alone.

## What we explicitly do NOT do

- **No shadcn CLI**. We own the source of every component we ship; we
  don't run `npx shadcn add`.
- **No Tailwind v3 config file** (`tailwind.config.ts`). v4 uses
  `@theme` in CSS — no JS config.
- **No CSS-in-JS** (emotion, styled-components, vanilla-extract).
- **No replacing FloatingPanel / ChatDrawer / HudWidget shape.** They
  are load-bearing custom geometry, not styling pain.
- **No design-token sweep into TypeScript constants.** Tokens live in
  `@theme`; reference from JS via `getComputedStyle()` only when
  unavoidable.
- **No mid-migration "two competing styles" period longer than 2 weeks.**
  Either phase 3 ships or we revert; we do not let utility classes and
  bespoke CSS fight each other in the same file indefinitely.

## Success criteria

- All tokens defined in `@theme`; `:root` only holds non-Tailwind app-
  state vars.
- `components/primitives/` has at least Dialog, Tabs, Tooltip, Select,
  Popover.
- `components/chrome/` has at least Button, Card, Pill, Chip.
- DecreeModal, DispatchPanelBody select, KingdomPanelBody tabs all use
  primitives — manual modal/tab code deleted.
- `title=` attributes on HUD surfaces replaced with `<Tooltip>`.
- `styles.css` shrinks below ~2000 lines (rough heuristic — most of the
  pure component CSS migrates out).
- New components reach for `components/` by default; PRs that add
  bespoke modal / dropdown / tooltip code get pushed back.

## Out of scope

- Visual redesign of any existing surface — this is plumbing, not
  aesthetics.
- Theming system (light mode, alt palettes) — possible later once
  tokens are real.
- Storybook — useful at ~30 components, we have ~12.
- Renaming `.wielder-panel-tab*` (still used by KingdomPanelBody only)
  until those tabs migrate to the Tabs primitive (then delete entirely).

## Open questions

- **Class-prefix?** Use `kh-` on chrome components (`.kh-button`,
  `.kh-card`) for collision insurance, or stay flat? Lean: no prefix
  inside Tailwind utilities; reserve `kh-*` only if we expose any
  components externally.
- **`cn()` helper location?** Stand up `src/renderer/src/lib/cn.ts`
  with `clsx + tailwind-merge`, or inline a 5-line version? Lean:
  install `clsx` + `tailwind-merge` (combined ~3kb gzipped, both
  well-tested).
- **Where does the chat-drawer's animated collapse live?** The grid-
  template-rows trick is awkward in Tailwind. Lean: leave that one
  rule in `styles.css` and tag the section as "intentionally not
  utility-class" so future cleanups don't try to migrate it.
- **Token doc location?** New `.docs/design/tokens.md` (this plan
  assumes), or keep under `.docs/architecture/`? Lean: `.docs/design/`
  if we expect more visual reference docs to follow.
