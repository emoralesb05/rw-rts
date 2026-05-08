# Design Tokens

Keykeeper's React DOM design tokens live in
`src/renderer/src/styles.css` inside Tailwind v4's `@theme` block.
The legacy `:root` alias bridge has been removed; component styling
should reference these tokens through Tailwind utilities such as
`bg-panel`, `text-muted`, `border-line`, and arbitrary values backed by
`var(--color-*)` only when a utility cannot express the exact value.

For component layering and ownership rules, see
[`components.md`](./components.md).

## Color

| Token | Use |
|---|---|
| `--color-bg` | app background, modal overlay tint |
| `--color-panel`, `--color-panel-2` | legacy panel surfaces |
| `--color-surface-1`, `--color-surface-2` | new component surfaces |
| `--color-line`, `--color-line-strong` | borders and separators |
| `--color-text`, `--color-muted` | primary and secondary text |
| `--color-accent`, `--color-accent-alt` | cyan primary and gold emphasis |
| `--color-danger`, `--color-warning`, `--color-success` | semantic states |

## Scale

| Token | Use |
|---|---|
| `--spacing` | Tailwind spacing unit (`p-1` = 4px) |
| `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill` | component radii |
| `--z-canvas`, `--z-hud`, `--z-panel`, `--z-drawer`, `--z-alert`, `--z-modal`, `--z-popover` | layering |
| `--duration-fast`, `--duration-base`, `--duration-slow` | motion timing |
| `--ease-out` | default ease-out curve |
| `--font-ui`, `--font-mono` | UI and monospace font stacks |

## Migration Rule

New React components should use Tailwind utilities backed by these
tokens. New bespoke CSS should only be added for actual global concerns:
Tailwind theme/source declarations, third-party CSS imports, or named
keyframes consumed by Tailwind animation utilities.
