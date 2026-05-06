# Design Tokens

Keykeeper's React DOM design tokens live in
`src/renderer/src/styles.css` inside Tailwind v4's `@theme` block.
Existing vanilla CSS still reads the legacy variables in `:root`; those
variables are now aliases to the theme tokens so old and new styling can
coexist during the migration.

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
tokens. Existing CSS can keep legacy names while it is being migrated,
but new bespoke CSS should only be added for global concerns, Phaser
canvas integration, Streamdown/KaTeX markup we do not own, or explicitly
tagged irreducible animation/layout rules.
