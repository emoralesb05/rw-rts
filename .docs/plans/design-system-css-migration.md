# Plan: Design System CSS Migration

**Status**: complete · **Owner**: TBD · **Phase**: CSS shrink after Radix/OSS foundation

## Goal

Shrink `src/renderer/src/styles.css` from ~3500 lines to the small set
of authored CSS that still belongs globally: Tailwind v4 tokens,
third-party CSS imports, and named keyframes used by Tailwind animation
utilities. Owned React surfaces should carry their styling through
design-system primitives and Tailwind classes.

## Progress

- Baseline before this migration pass: `styles.css` ~3519 lines.
- After the Panel Shells slice: `styles.css` 1569 lines.
- After the Drawer + Conversation slice: `styles.css` 526 lines.
- After the Decree + Final Sweep slice: `styles.css` 167 lines.
- Migrated to owned components / Tailwind utilities:
  `HudWidget`, `ActivityLog`, `KingdomHeader`, `CloseAllChip`,
  `PartyRow`, `LetterCard`, `WielderHUD`, `AlertsHUD`, and
  `LettersHUD`, plus `FloatingPanel`, `WielderPanelBody`,
  `DispatchPanelBody`, `SettingsPanelBody`, `KingdomPanelBody`,
  `ChatDrawer`, `ConversationStream`, `WielderChatInput`, and
  `UnitInspector`, `DecreeModal`, the root app shell, and the Phaser
  stage host.
- App-specific chip styling now lives in `AgentToolBadge`,
  `ArchetypeChip`, and `RenownBadge` instead of shared global CSS.
- Streamdown markdown styling is owned by `ConversationStream` component
  mappings instead of global `.md*` selectors.
- Alert-card spotlighting now applies Tailwind animation utility classes
  through `pulseLetterElement`, so no global `.letter-pulse` selector is
  needed.

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
   **Done.**

5. **Final Sweep**
   Move root app shell/document sizing, Phaser stage host, legacy
   markdown selectors, and classList animation hooks into owned
   React/Tailwind code.
   **Done.**

## Remaining Global CSS

- `@theme` token definitions.
- Tailwind, Streamdown, and KaTeX imports plus Tailwind `@source`
  entries for Streamdown plugin classes.
- Named keyframes referenced from Tailwind arbitrary animation utilities.

## Success Criteria

- `styles.css` is under ~400 lines. **Done: 167 lines.**
- New component styling uses `components/` or Tailwind utility classes.
- No broad app surface depends on legacy bespoke CSS when an owned atom
  or primitive exists.
- `rg "(className=\"app|className=\"stage|window-drag-strip|world-nav|md-|\\.letter-pulse)" src/renderer/src`
  returns no legacy selector dependencies.
