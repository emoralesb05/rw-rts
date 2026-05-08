# Plan: Design system — Radix + Tailwind, shadcn-style owned components

**Status**: complete · **Owner**: TBD · **Phase**: Radix/OSS UI foundation

## Goal

Complete keykeeper's **Radix Primitives + Tailwind v4** foundation with a
shadcn-style **owned** component library under
`src/renderer/src/components/`. Aesthetic stays KH-themed; the migration
is structural. We are **not** installing the shadcn CLI — we own every
component we ship.

The remaining large `styles.css` shrink is split into
`.docs/plans/design-system-css-migration.md`; this plan is closed once
the foundation components, behavior wrappers, and first real migrations
are in place.

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
   the planet; agents (and humans) onboard faster on it than on a 3500-
   line bespoke CSS file.

shadcn the *aesthetic* (clean SaaS dashboard) is wrong for keykeeper.
shadcn the *pattern* (owned components wrapping Radix, tailwind-classed)
is exactly right. We adopt the pattern, skip the package.

## Where we are today

- `src/renderer/src/styles.css` — still the largest UI surface; vanilla
  CSS is shrinking incrementally instead of through a risky bulk rewrite.
- **Tailwind v4 is installed and wired**: `@tailwindcss/vite` plugin in
  `electron.vite.config.ts`, `@import "tailwindcss"` at the top of
  `styles.css`, and an initial `@theme` token block now backs new
  utilities.
- **Legacy CSS variables are aliased to Tailwind theme tokens**:
  `--bg --line --accent --accent-2 --text --muted` remain for existing
  CSS while new components use `bg-*`, `text-*`, `border-*`, radius, z,
  motion, and font tokens.
- **Radix primitives are installed** for dialog, alert dialog, tabs,
  tooltip, toast, select, separator, popover, dropdown menu, scroll
  area, label, switch, checkbox, and radio group.
- **cmdk is installed** and wrapped as an owned `Command` primitive for
  command-palette behavior.
- **Owned component directories exist** under
  `src/renderer/src/components/primitives/` and
  `src/renderer/src/components/chrome/`. Imports are direct rather than
  going through a barrel.
- **First migrations are done**: `DecreeModal` uses Radix Dialog,
  `DispatchPanelBody` uses Radix Select for target selection, and
  `KingdomPanelBody` uses Radix Tabs.
- **Hand-rolled behavior** in:
  - `FloatingPanel.tsx:81` — Escape close + manual z-stack focus
  - `ChatDrawer.tsx` — drag-to-resize, manual tab close, manual focus
  - `LetterCard.tsx` × 4 + 5 other places — `e.stopPropagation()`
  - Remaining work is now mostly CSS migration, not missing Radix/OSS
    behavior primitives.

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
    AlertDialog.tsx              ← wraps @radix-ui/react-alert-dialog
    Tabs.tsx                     ← wraps @radix-ui/react-tabs
    Tooltip.tsx                  ← wraps @radix-ui/react-tooltip
    Toast.tsx                    ← wraps @radix-ui/react-toast
    Separator.tsx                ← wraps @radix-ui/react-separator
    Popover.tsx
    Select.tsx
    DropdownMenu.tsx
    ScrollArea.tsx
    Label.tsx
    Switch.tsx
    Checkbox.tsx
    RadioGroup.tsx
    Command.tsx                  ← wraps cmdk command menu primitives
  chrome/                        ← styled atoms with no Radix counterpart
    Button.tsx                   ← .btn / .btn.primary / .btn.ghost variants
    Card.tsx
    Pill.tsx                     ← KingdomHeader pill, tool-pill
    Chip.tsx                     ← hud-action-btn
    Bar.tsx                      ← HP/MP/FC bars
    Input.tsx
    Textarea.tsx
    Field.tsx
    IconButton.tsx
    Badge.tsx
    EmptyState.tsx
    SegmentedControl.tsx
    Code.tsx
    Kbd.tsx
    Skeleton.tsx
    TooltipHint.tsx
    ToastLayer.tsx
    Toolbar.tsx
```

App-specific surfaces (HudWidget, ChatDrawer, FloatingPanel, the various
`*PanelBody` files) stay in `ui/` and *use* the components.
Imports stay direct; no component barrel is planned.

### Component Inventory

The current scaffold covers the common controls we already know we need.
Do not add more generic components speculatively unless a migration uses
them in the same slice.

Shipped in the Radix/OSS foundation:

| Component | Type | Current use |
|---|---|---|
| `Command` | cmdk wrapper | Global command palette; Decree inline @file and /command palettes |
| `Separator` | Radix wrapper | Command palette divider |
| `Skeleton` | chrome | Hook bridge loading state |
| `Bar` | chrome | Party-row HP/MP meters |
| `Toast` / `ToastLayer` | Radix wrapper + chrome provider | Copy/save success and failure feedback |
| `Toolbar` | chrome | Kingdom action cluster; letter action row |

No component blockers remain for this plan. Future product-triggered
components:

| Component | Type | Add When | Notes |
|---|---|---|---|
| `Progress` | Radix wrapper or chrome | Determinate progress with ARIA semantics | Keep `Bar` for HP/MP/FC visuals unless accessibility semantics matter. |
| `Slider` | Radix wrapper | Volume, density, animation speed, zoom, future settings | Add with the first real slider setting. |

### Component conventions (shadcn-style)

Each primitive component:
- Exports the styled Radix subcomponents we use
- Uses Tailwind utilities for styling, with token-backed classes
- Uses React 19 ref-as-prop conventions and exposes `className` for
  surface-specific overrides (`cn()` helper merges defaults + caller
  overrides)
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
   **Done for the initial color, spacing, radius, z-index, motion, and
   font tokens.**
2. Run a sweep replacing the 5 existing `--accent` / `--muted` /
   `--text` / `--line` / `--bg` definitions to point at the new token
   names (or keep both names aliased so existing CSS still resolves).
   **Done via aliases; broad CSS migration remains incremental.**
3. Lift z-index numbers from `panel-store.ts` to CSS vars; reference
   from JS via `getComputedStyle()` only where needed. **Started for CSS
   token definitions; TS consumers still use their existing constants.**
4. Document in `.docs/design/tokens.md` (new directory). **Done.**

**Success**: no visual change. `bun run dev` and screenshot diffs to
prove it.

### Phase 2 — Install Radix + scaffold `components/` (½ day)

1. `bun add @radix-ui/react-dialog @radix-ui/react-tabs
   @radix-ui/react-tooltip @radix-ui/react-select`
   plus popover, dropdown menu, scroll area, label, switch, checkbox,
   and radio group. **Done.**
2. Create `src/renderer/src/components/primitives/` and
   `src/renderer/src/components/chrome/`. **Done.**
3. Add `src/renderer/src/lib/cn.ts` (clsx + tailwind-merge). **Done.**
4. Build `Dialog`, `Tabs`, `Tooltip` as the first three primitives.
   Style with Tailwind utilities only — no entries in `styles.css`.
   **Done, with `Select`, `Popover`, `DropdownMenu`, `ScrollArea`,
   `Label`, `Switch`, `Checkbox`, `RadioGroup`, `AlertDialog`,
   `Separator`, `Toast`, and `Command` wrappers also scaffolded.**
5. Build first chrome atoms for common app surfaces. **Done for
   `Button`, `Card`, `Pill`, `Chip`, `Bar`, `Input`, `Textarea`,
   `Field`, `IconButton`, `Badge`, `EmptyState`, and
   `SegmentedControl`, with `Code`, `Kbd`, `Skeleton`, and
   `TooltipHint`, `ToastLayer`, and `Toolbar` added as later migration
   slices needed them.**

### Phase 3 — First migrations (1 day)

In this order (smallest blast radius first):

1. **DecreeModal → Dialog** — drop manual Escape, manual stopPropagation,
   manual modal markup. Verify keyboard nav works end-to-end. **Done.**
2. **DispatchPanelBody native `<select>` → Select** — fixes the
   long-standing aesthetic outlier. **Done.**
   Dispatch also uses `Field`, `Textarea`, `SegmentedControl`, `Button`,
   and `Kbd` for the rest of its form chrome. **Done.**
3. **KingdomPanelBody manual tablist → Tabs** — cleaner JSX, free arrow-
   key nav. **Done.**
   Initial Kingdom action/code surfaces use `Button` and `Code`. **Done.**
4. **Sweep `title=` attributes on HUD chips → Tooltip** — start with the
   most-hovered surfaces (party-row chat icon, KingdomHeader pill,
   action chips). **Done for DOM `title` attributes under `ui/`; the
   remaining `title=` matches are component props.**
5. **ChatDrawer manual tablist → Tabs** — dynamic tab bar now uses Radix
   Tabs while preserving the existing visual chrome. **Done.**
6. **Native `confirm()` flows → AlertDialog** — Reset Kingdom, Recall,
   and Standing Order confirmation now use the owned AlertDialog wrapper.
   **Done.**
7. **CommandPalette manual dialog/listbox → cmdk + Dialog** — global
   command search now uses the owned `Command` wrapper inside Radix
   Dialog; the old command-palette CSS block was deleted. **Done.**
8. **Decree inline palettes → Command** — @file and /command suggestions
   use the same owned `Command` primitive. **Done.**
9. **Toast feedback → Toast** — copy request and settings save/failure
   feedback now use the app-level Radix Toast layer. **Done.**
10. **Repeated action clusters → Toolbar** — kingdom header actions and
    letter action rows use the owned `Toolbar` atom. **Done.**

After each, delete the now-dead CSS from `styles.css`.

### Phase 4 — Build out remaining primitives on demand (ongoing)

Add when the next surface needs them:
- **Popover** — settings menu, world filter dropdowns. **Scaffolded.**
- **DropdownMenu** — wielder "more actions" once 5-button strip caps out.
  **Scaffolded.**
- **ScrollArea** — drawer body, activity log, conversation stream
  (custom dark scrollbar). **Scaffolded.**
- **Switch / Checkbox / RadioGroup** — settings toggles, multi-select
  permissions, and segmented controls. **Scaffolded.**
- **Kbd / Code** — shortcut and inline-code chrome. **Scaffolded and
  used in Dispatch, Settings, and Kingdom panel surfaces.**
- **AlertDialog** — destructive confirmation primitive. **Scaffolded and
  used for Reset Kingdom, Recall, and Standing Order confirmation.**
- **Separator / Skeleton** — low-risk components. **Scaffolded and used.**
- **Toolbar** — repeated icon-button clusters. **Scaffolded and used.**
- **Progress / Slider** — accessible progress and numeric adjustment
  controls. **Future; add with the first real progress/slider surface.**
- **Command** — cmdk-backed command primitive. **Scaffolded and used.**
- **Toast** — higher-behavior primitive. **Scaffolded and used.**

### Phase 5 — Chrome atoms (1 day)

Build `Button`, `Card`, `Pill`, `Chip`, `Bar`, `Input`, `Textarea`,
`Field`, `IconButton`, `Badge`, `EmptyState`, `SegmentedControl`,
`Code`, `Kbd`, `Skeleton`, `TooltipHint`, `ToastLayer`, and `Toolbar`
in `components/chrome/`.
**Scaffolded.**
`SettingsPanelBody`, `DispatchPanelBody`, `WielderChatInput`,
`CommandPalette`, `LetterCard`, `PartyRow`, `WielderHUD`, ActivityLog,
ConversationStream, UnitInspector, and initial `KingdomPanelBody`
controls now use these atoms. `PartyRow` uses `Bar` for HP/MP meters.
The remaining broad CSS migration is tracked in
`.docs/plans/design-system-css-migration.md`.

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

## Follow-Up CSS Migration

The remaining `styles.css` shrink is not a component-foundation blocker.
It lives in `.docs/plans/design-system-css-migration.md`.

## What we explicitly do NOT do

- **No shadcn CLI**. We own the source of every component we ship; we
  don't run `npx shadcn add`.
- **No Tailwind v3 config file** (`tailwind.config.ts`). v4 uses
  `@theme` in CSS — no JS config.
- **No CSS-in-JS** (emotion, styled-components, vanilla-extract).
- **No design-token sweep into TypeScript constants.** Tokens live in
  `@theme`; reference from JS via `getComputedStyle()` only when
  unavoidable.
- **No mid-migration "two competing styles" period longer than 2 weeks
  per phase.** Each phase ships fully or reverts; we do not let
  utility classes and bespoke CSS fight each other indefinitely.
- **No keeping a custom CSS rule "because it works."** If it has no
  IRREDUCIBLE tag and a Tailwind equivalent exists, it migrates.

## Success criteria

- All tokens defined in `@theme`; `:root` only holds non-Tailwind
  app-state vars.
- `components/primitives/` has Dialog, Tabs, Tooltip, Select, Popover,
  DropdownMenu, ScrollArea, Label, Switch, Checkbox, RadioGroup,
  AlertDialog, Separator, Toast, Command.
- `components/chrome/` has Button, Card, Pill, Chip, Bar, Input,
  Textarea, Field, IconButton, Badge, EmptyState, SegmentedControl,
  Code, Kbd, Skeleton, TooltipHint, ToastLayer, Toolbar.
- DecreeModal, DispatchPanelBody, KingdomPanelBody, ChatDrawer, and
  CommandPalette use primitives — manual modal / tab / select /
  command-list code deleted.
- `title=` attributes on HUD surfaces replaced with `<Tooltip>`.
- Toast feedback exists for copy/save flows.
- No `forwardRef` usage in owned components.
- New components reach for `components/` by default; PRs that add
  bespoke CSS get pushed toward the follow-up CSS migration plan.

## Out of scope

- Visual redesign of any existing surface — this is plumbing, not
  aesthetics. Pixel-diff equivalence is the bar at the end of every
  phase.
- Theming system (light mode, alt palettes) — possible later once
  tokens are real.
- Storybook — useful at ~30 components, we have ~12.
- Phaser-canvas-side rendering (sprites, shaders, world atmospherics).
  That's a different system; this plan is the React DOM only.
- Full `styles.css` shrink; see
  `.docs/plans/design-system-css-migration.md`.

## Open questions

- **Class-prefix?** Use `kh-` on chrome components (`.kh-button`,
  `.kh-card`) for collision insurance, or stay flat? Lean: no prefix
  inside Tailwind utilities; reserve `kh-*` only if we expose any
  components externally.
- **`cn()` helper location?** Stand up `src/renderer/src/lib/cn.ts`
  with `clsx + tailwind-merge`, or inline a 5-line version? Lean:
  install `clsx` + `tailwind-merge` (combined ~3kb gzipped, both
  well-tested).
- **Progress / Slider?** No current product surface needs them. Add
  with the first determinate progress or numeric setting flow.
