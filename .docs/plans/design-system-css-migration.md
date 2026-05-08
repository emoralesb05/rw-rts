# Plan: Design System CSS Migration

**Status**: in progress · **Owner**: TBD · **Phase**: CSS shrink after Radix/OSS foundation

## Goal

Shrink `src/renderer/src/styles.css` from ~3500 lines to the small set
of authored CSS that is actually irreducible: Tailwind v4 tokens, global
resets, Phaser canvas integration, keyframes, and markup we do not own.
The Radix/OSS component foundation has landed; this plan owns only the
remaining CSS migration work.

## Progress

- Baseline before this migration pass: `styles.css` ~3519 lines.
- Current size after the Panel Shells slice: `styles.css` 1569 lines.
- Current size after the Drawer + Conversation slice: `styles.css` 526 lines.
- Migrated to owned components / Tailwind utilities:
  `HudWidget`, `ActivityLog`, `KingdomHeader`, `CloseAllChip`,
  `PartyRow`, `LetterCard`, `WielderHUD`, `AlertsHUD`, and
  `LettersHUD`, plus `FloatingPanel`, `WielderPanelBody`,
  `DispatchPanelBody`, `SettingsPanelBody`, `KingdomPanelBody`,
  `ChatDrawer`, `ConversationStream`, `WielderChatInput`, and
  `UnitInspector`.
- App-specific chip styling now lives in `AgentToolBadge`,
  `ArchetypeChip`, and `RenownBadge` instead of shared global CSS.
- CSS kept from these slices is limited to shared keyframes and surfaces
  still awaiting migration, mainly decree/command controls and generated
  markdown/Streamdown styling.

## Migration Order

1. **Chrome HUDs**
   `HudWidget`, `AlertsHUD`, `LettersHUD`, `WielderHUD`,
   `KingdomHeader`, `ActivityLog`, `LetterCard`, `PartyRow`, and
   `CloseAllChip`. **Done.**

2. **Panel Shells**
   `FloatingPanel`, `PanelLayer`, `WielderPanelBody`,
   `DispatchPanelBody`, `SettingsPanelBody`, and `KingdomPanelBody`.
   **Done.**

3. **Drawer + Conversation**
   `ChatDrawer`, `ConversationStream`, `WielderChatInput`, and
   `UnitInspector`. **Done.**

4. **Decree + Command Surfaces**
   `DecreeModal` and any remaining command/decree CSS that can now move
   onto owned primitives or inline Tailwind utilities.

5. **Final Sweep**
   Walk `styles.css` top to bottom. Every surviving rule must be one of
   the categories below and carry an `IRREDUCIBLE` comment unless it is
   inside `@theme`.

## Irreducible CSS

- `@theme` token definitions.
- Global resets, `body`, `#root`, `.window-drag-strip`, and font-face
  declarations.
- Phaser canvas overlay positioning and z-stack integration.
- Keyframes and animation hooks that Tailwind cannot express cleanly.
- Streamdown, markdown, Mermaid, and KaTeX overrides for generated
  markup we do not control.
- Complex layout transitions that are less readable as Tailwind
  arbitrary values, after a case-by-case audit.

Each survivor gets:

```css
/* IRREDUCIBLE: <reason> */
```

## Success Criteria

- `styles.css` is under ~400 lines.
- `grep -n IRREDUCIBLE src/renderer/src/styles.css` returns a short,
  readable inventory.
- New component styling uses `components/` or Tailwind utility classes.
- No broad app surface depends on legacy bespoke CSS when an owned atom
  or primitive exists.
