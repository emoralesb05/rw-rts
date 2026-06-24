# Renderer Components

This directory is the reusable design-system layer for the renderer.
It lives under `ui` because these are renderer UI components, not shared
domain modules. Domain/product surfaces live in the parent `ui/` folder.

## Layers

- `primitives/` wraps behavior and accessibility from OSS libraries
  such as Radix UI and cmdk. These components should stay visually
  minimal and generic.
- `kit/` contains Realmkeeper-styled building blocks such as buttons,
  badges, inputs, bars, toolbars, toast wiring, and empty states.

## Rules

- Import concrete files directly. Do not add barrel re-exports.
- Put provider/game/HUD-specific components in the parent `ui/` folder,
  not here.
- Prefer `kit/` components before writing repeated inline Tailwind.
- Prefer `primitives/` when the hard part is focus management,
  keyboard behavior, portals, overlays, or ARIA semantics.
