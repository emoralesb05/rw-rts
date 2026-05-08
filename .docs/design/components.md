# Renderer Component System

## Directory Boundaries

`src/renderer/src/ui/components/` is the reusable renderer design-system
layer. It intentionally lives under `ui` because these are still renderer
UI components, not app-wide shared domain modules.

`src/renderer/src/ui/` also contains the product layer: HUDs, panels,
drawers, letters, wielder-specific surfaces, and app workflows.

This split keeps domain concepts from leaking into shared controls.
For example, `Button` belongs in `ui/components/kit`; `AgentToolBadge`
belongs in `ui` because it knows about Claude/Codex/Cursor/Gemini.

## Component Layers

| Layer | Path | Purpose |
|---|---|---|
| Primitives | `ui/components/primitives/` | Thin wrappers around behavior/accessibility libraries such as Radix UI and cmdk. |
| Kit | `ui/components/kit/` | Keykeeper-styled reusable controls and atoms: buttons, badges, fields, bars, inputs, toasts. |
| Product UI | `ui/` | Domain-specific application surfaces built from primitives and kit components. |

## Naming

`kit` replaced the older `chrome` folder name. The old meaning was
"app chrome controls", but it was too easy to confuse with Chromium or
browser chrome. `kit` now means "styled Keykeeper building blocks."

`primitives` means "behavior primitives", not "unstyled forever."
They may carry baseline styling, but they should not know Keykeeper
domain concepts.

## Import Rule

Import concrete files directly:

```ts
import { Button } from "./components/kit/Button";
import { Dialog } from "./components/primitives/Dialog";
```

Do not add index/barrel files. Explicit imports make ownership obvious
and avoid accidental public APIs.

## Styling Rule

Use this order:

1. Existing `ui/components/kit` component.
2. Existing `ui/components/primitives` wrapper plus Tailwind classes.
3. A new small `ui/components/kit` component when repetition is real.
4. Inline Tailwind for one-off product composition.
5. Global CSS only for Tailwind theme/source declarations,
   third-party imports, or named keyframes.
