# Plan: Design system — primitives + tokens (Radix vs shadcn vs custom)

**Status**: planned, not started · **Owner**: TBD · **Phase**: Post-Phase-2B polish

## Goal

Decide whether keykeeper's UI keeps growing as bespoke CSS + hand-rolled
behavior, or adopts a primitives library (Radix / shadcn / Base UI),
and lock in a small, named design system either way. The KH-themed
gamey aesthetic is non-negotiable — any direction that weakens that
identity is off the table.

## Where we are today

- `src/renderer/src/styles.css` is **3430 lines** in a single file —
  grown organically with each surface (drawer, HUDs, panels, alerts,
  letters, command bar, etc.). Still legible, sectioned with banner
  comments, but every new component adds 50–150 lines.
- **5 design tokens** in `:root`: `--bg --line --accent --accent-2
  --text --muted`. That's the entire palette spine. There's no
  spacing scale, no radius scale, no z-index scale, no motion scale,
  no typography scale.
- **Behavior is hand-rolled** in many places that would be free with
  Radix:
  - `DecreeModal.tsx:72` — Escape close (no focus trap, no inert
    background, no scroll lock)
  - `FloatingPanel.tsx:81` — Escape close, manual z-index focus stack
  - `ChatDrawer.tsx` — drag-to-resize, tab close, manual focus
  - `LetterCard.tsx` × 4 — `stopPropagation` to prevent clicks from
    bubbling to body
  - `KingdomPanelBody.tsx` — manual `role="tablist" / "tab" / aria-
    selected` plumbing for Overview/Settings/Connection/Demos
  - `DispatchPanelBody.tsx` — native `<select>` for target repo (the
    one place we cheaped out on aesthetic — sticks out)
- **No tooltips** beyond browser `title=` (no delay, no positioning,
  no keyboard reveal)
- **No popovers** (Settings menu, future filter UIs would need this)
- **No focus management for modals** — Decree opens but a screen
  reader / keyboard user can tab out of it into the canvas
- **No portal layer** — drawer / modals / panels render in-tree, so
  `overflow: hidden` on an ancestor would clip them

## What "design system" should mean here

Two things, regardless of library choice:

1. **Tokens** — a real semantic palette + scales:
   - Color: `--accent` / `--accent-alt` / `--danger` / `--warning` /
     `--success` / `--muted` / surface tiers (`--surface-1/2/3`) and
     border tiers (`--line-1/2`)
   - Spacing scale: `--s-1 .. --s-8` (4px / 6px / 8px / 12px / 16px /
     24px / 32px / 48px) — most of the codebase already converges on
     these values, just unnamed
   - Radius: `--r-sm 4` `--r-md 6` `--r-lg 10` `--r-pill 999`
   - Z scale: `--z-canvas 0` `--z-hud 50` `--z-panel 1000` `--z-
     drawer 1200` `--z-alert 1400` `--z-modal 2000` (panel-store has
     these in code; lift to CSS so they're visible together)
   - Motion: `--ease-out` `--dur-fast 120ms` `--dur-base 200ms` `--
     dur-slow 320ms`
   - Type: `--fs-9 --fs-10 --fs-11 --fs-12 --fs-14`, `--ff-ui` `--
     ff-mono`
2. **Primitive layer** — behavior-correct building blocks for
   Modal, Popover, Tooltip, Tabs, Select, Dropdown, ScrollArea — the
   things we'd otherwise re-invent every time.

Tokens we own. The primitive layer is the actual library decision.

## Options

### Option A — Radix Primitives (headless) + our tokens

Install per-component (`@radix-ui/react-dialog`, `react-tabs`, `react-
select`, `react-tooltip`, `react-popover`, etc.). They ship behavior +
ARIA only — zero styles. We map them to our existing CSS conventions.

**Pros**:
- Zero aesthetic surrender. Every pixel still ours; classes still
  `.kh-*` style.
- Massive a11y win for free: focus trap, focus return, scroll lock,
  inert background, escape, click-outside, arrow-key tab nav, dropdown
  positioning (auto-flip), portal layer for overlays.
- Battle-tested (used by Vercel, Linear, Cursor, GitHub, every shadcn
  install). Stable v1 APIs.
- Tree-shakeable; pay only for what you import.
- Co-exists cleanly with the Phaser canvas (portals don't clip).

**Cons**:
- Still writing our own CSS for every component (the styles.css size
  problem doesn't go away by itself — we'd address that with token
  refactor + maybe per-component `.module.css` splits).
- One more dependency surface (~30kb gzipped if we adopt 6 primitives;
  individually ~2–6kb each).
- Our `FloatingPanel` is custom-shaped (drag, multi-instance, z-stack
  focus) — Radix Dialog doesn't quite fit; we'd keep FloatingPanel and
  use Radix Dialog only for the truly modal surfaces (Decree, future
  confirmation dialogs).

### Option B — shadcn/ui (Radix + Tailwind, copy-paste source)

Run `npx shadcn` to generate components into our repo. They come with
Tailwind classes; we own and edit the source.

**Pros**:
- Fastest to "running components." Big stylistic library out of the
  box.
- You own the source — no version churn.
- Patterns are well-tested (Linear / Vercel staff back them).

**Cons (significant for keykeeper)**:
- **Forces Tailwind adoption**, which is a full architectural change
  from our current vanilla CSS + custom-properties approach. Migration
  means Tailwind config, `@apply` or full class refactor across all
  3430 lines of styles, learning the utility convention, and accepting
  that color tokens now live in `tailwind.config.ts` instead of `:root`.
- The shadcn aesthetic is "clean SaaS dashboard" — it'd take real
  effort to make it feel KH-themed (gold/cyan accents, dark canvas,
  pixel sprites). We'd be fighting the defaults, which defeats the
  paste-in benefit.
- Tailwind's class-soup hurts readability of components that already
  carry game-state logic (HudWidget, ChatDrawer).

### Option C — shadcn with Base UI (MUI Base)

Same paste-in flow as B but built on MUI's Base UI primitives instead
of Radix. Newer, less battle-tested. Same Tailwind story.

**Pros**: marginally smaller dep surface than Radix; MUI team
maintains it.

**Cons**: all of B, plus less mature than Radix, fewer public
case-study integrations. **Not recommended** unless we have a specific
reason to want MUI in the tree (we don't).

### Option D — Pure custom (status quo, slightly polished)

Keep what we have. Add a focus-trap util, a small `<Modal>` wrapper, a
tokens refactor.

**Pros**: zero new deps. Maximum aesthetic ownership.
**Cons**: we'll re-invent dropdown positioning, popover collision
detection, scroll lock, inert background. Native `<select>` keeps
sticking out. Each new surface is another a11y audit we won't do.

## Recommendation — Option A + token refactor

Adopt **Radix Primitives** behind our existing `.kh-*` CSS. Keep
vanilla CSS + custom properties. Don't touch Tailwind.

Why:
- The pain is **behavior** (focus traps, dropdown positioning,
  tooltip a11y, portals), not styling — we're good at the styling.
- Aesthetic ownership matters more than component velocity for an
  app this opinionated.
- Radix lets us swap the native `<select>` for a real Select without
  changing how we write CSS.
- Future surfaces (filter dropdowns on Activity, settings popover,
  confirm-recall dialog with focus trap) become 30 minutes instead
  of half-day.

Tokens get expanded regardless of which option we pick — that's the
"design system" half of the question, and it's pure win.

## Migration plan (Option A)

### Phase 1 — Tokens-first refactor (1 day, no behavior changes)

1. Expand `:root` to include the full token set listed above.
2. Sweep `styles.css` for hard-coded values (`8px`, `12px`, `4px`,
   color hex literals) and replace with token vars where they match.
   Aim for ~80% coverage; don't chase the long tail.
3. Move z-index numbers from `panel-store.ts` into CSS vars and
   reference from JS via `getComputedStyle(document.documentElement)`
   only if needed (most can stay as plain numbers in the store with
   a code comment pointing at the token source of truth).
4. Document tokens in `.docs/architecture/design-tokens.md` — single
   page, table of token + intent + value.

**Success**: no visual change, fewer magic numbers, one place to
adjust the palette.

### Phase 2 — First Radix primitive: Dialog (replaces DecreeModal manual modal) (½ day)

1. `bun add @radix-ui/react-dialog`
2. Wrap `DecreeModal` body in `<Dialog.Root>` + `<Dialog.Portal>` +
   `<Dialog.Overlay>` + `<Dialog.Content>`. Drop the manual Escape
   handler and the `e.stopPropagation()` on the content.
3. Verify focus trap, scroll lock, focus return, screen-reader
   announcement.
4. Pattern docs in `.docs/architecture/renderer.md` so the next
   primitive follows the same shape.

**Success**: Decree can be tab-navigated keyboard-only; focus
returns to the wielder card on close; cmd-tabbing away and back
preserves focus.

### Phase 3 — Replace native `<select>` with Radix Select (½ day)

DispatchPanelBody's repo picker. Style to match `.btn` aesthetic.
Same width and dark theme; gold-accent on hover. Win an aesthetic
inconsistency.

### Phase 4 — Add primitives as needed, never ahead-of-need

In order of expected payoff:
- **Tooltip** — replace `title=` attributes on HUD chips, status
  icons, action buttons. Big a11y + UX win.
- **Popover** — settings menu, world filter, future right-click
  context menus.
- **Tabs** — re-do KingdomPanelBody's manual tablist with
  `<Tabs.Root>`. Cleaner JSX, free arrow-key nav.
- **DropdownMenu** — wielder card's "more actions" menu (when we
  outgrow the 5-button inline strip).
- **ScrollArea** — chat-drawer body, activity log, conversation
  stream. Custom scrollbar that matches dark theme + works on
  hidden-scrollbar macOS.

Don't pre-install anything; pull in as the next surface needs it.

### Phase 5 — Stop writing new vanilla components

Once 4 is in flight, the rule becomes: any new overlay / popover /
menu / dialog uses a Radix primitive. Existing custom components
(FloatingPanel, ChatDrawer, HudWidget) stay — they're shaped
differently from anything Radix offers and the cost of rewriting
exceeds the maintenance burden.

## What we explicitly do NOT do

- **No Tailwind**. The conversion would touch every line of
  styles.css and the aesthetic risk is real.
- **No CSS-in-JS** (emotion / styled-components / vanilla-extract).
  Vanilla CSS + custom properties is working.
- **No replacing FloatingPanel / ChatDrawer / HudWidget** with
  Radix equivalents. They're load-bearing custom shapes (multi-
  instance drag, persistent tabs, animated collapse).
- **No design-token sweep into TypeScript**. Tokens live in CSS;
  reference from JS only when unavoidable (z-index chains).

## Success criteria

- Tokens documented + ~80% of styles.css uses them
- Decree, Dispatch select, and at least one Tooltip surface use
  Radix primitives
- Modal-context keyboard nav (Escape, focus trap, focus return)
  works in DecreeModal and any new dialog
- New components reach for primitives by default; no new hand-rolled
  modal / dropdown / tooltip code lands

## Out of scope

- Visual redesign of any existing surface (this plan is plumbing,
  not aesthetics)
- Themeing system (light mode, alt palettes) — could come later
  once tokens are real
- Storybook / component playground — useful at ~30 components, we
  have ~12

## Open questions

- Do we want a `kh-` class prefix going forward (e.g.,
  `.kh-dialog`), or keep the current flat namespace? Prefix is
  cheap insurance against future collisions if we ever embed
  keykeeper UI inside another shell.
- Should the token doc live in `.docs/architecture/` (engineering
  reference) or a new `.docs/design/` directory (intent + visual
  examples)? Lean toward `.docs/design/` if we expect to add more
  visual reference docs.
