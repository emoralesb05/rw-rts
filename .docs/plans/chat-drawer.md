# Plan: Chat drawer (right-edge, multi-tab)

**Status**: planned, not started · **Owner**: TBD · **Phase**: Post-MVP polish

## Goal

Replace the per-wielder floating Messages panel with a single **chat drawer** at the right edge: 50% × 100% by default, multi-tab, slides in when first chat opens, hides when last tab closes. Each tab is a wielder's `ConversationStream` + chat input. The Wielder floating panel slims back to status-only.

## Why

- Today every wielder you message gets its own floating panel — they pile up and overlap
- Floating panels feel modal even when they're not; the drawer pattern is more ambient
- A single tabbed surface lets you compare/switch between wielders without losing window positions
- Pairs naturally with the [observed-resume](./observed-resume.md) work — the chat surface is about to do more (drive wielders we don't own), so it deserves a real home

## Shape

```
Closed (drawer hidden, HUDs default):

┌─────────────────────────────────────┐
│ Wielders   Header        Alerts    │
│                                     │
│         CANVAS                      │
│                          Letters    │
│ Activity                            │
└─────────────────────────────────────┘

Open (drawer slides in from right, ~50% width, full height):

┌──────────────────┬──────────────────┐
│ Wielders Header  │  Alerts (above)  │
│                  ├──────────────────┤
│       CANVAS     │ [Vaelen][Selene]✕│  ← tab bar
│                  ├──────────────────┤
│                  │  ConversationS.  │
│                  │                  │
│                  │  [chat input ⇧↵] │
│                  ├──────────────────┤
│ Activity         │  Letters (below) │
└──────────────────┴──────────────────┘
```

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Tab close UX | per-tab `×` button (treat tabs like dialogs) |
| 2 | Tab order | browser-style: most-recently-opened appended on the right |
| 3 | Tab label | `<tool-icon> <displayName>` + status dot (unread / permission-pending) |
| 4 | Animation | slide-in from right, ~150ms ease-out |
| 5 | Drawer width | user-resizable via left-edge drag handle, persisted |
| 6 | Status-panel parity | independent — closing the wielder's status panel does NOT close their drawer tab, and vice versa |
| 7 | z-index stacking | `AlertsHUD > drawer > LettersHUD` so permission alerts stay reachable above the drawer |

## Tab status indicator

A small dot on the right side of each tab label, with priority order (highest wins):

1. **🔴 red dot** — wielder has an unresolved `permission_request` letter
2. **🟡 yellow dot** — unread `assistant_text` / `tool_use` events since the tab was last active
3. **(none)** — no new activity

Clearing logic:
- Switching to the tab clears its yellow dot
- A red dot only clears when the permission is resolved (allow / deny / dismiss / upstream timeout)

## Z-index order (top to bottom of stack)

```
DecreeModal             10000  (full-screen blocking — when active, above all)
AlertsHUD               10500  (raised so it's above drawer when permissions are live)
ChatDrawer              10000
Wielder/Settings/etc    10000+ (zCounter as today, focused-on-top)
LettersHUD              10
KingdomHeader pill      10
WielderHUD / Activity   10
Canvas                  0
```

When the drawer is closed, AlertsHUD's elevated z-index doesn't matter (no overlap to worry about). When the drawer is open, AlertsHUD anchors at top-right (top: 38px, right: 12px) — overlaps the drawer's top-right corner by design, since alerts are SUPPOSED to draw the eye through everything.

## Open paths (where the drawer can be summoned from)

- **Party row 💬 button** (in `WielderHUD`) → `openDrawerTab(wielderId)`
- **Wielder floating panel** → existing Messages tab is removed, replaced with a **💬 Chat** button → `openDrawerTab(wielderId)`
- **ActivityLog row click** for a textual event → `openDrawerTab(wielderId)` + scroll to that event timestamp
- **Permission letter** in AlertsHUD → if the user clicks "go to wielder," opens the drawer tab

In every path: if the wielder already has a tab open, it's focused (no duplicate). Otherwise a new tab is appended.

## Persistence

- **Drawer width** — `keykeeper:drawer:width` localStorage, persisted across restarts
- **Open tabs / active tab** — NOT persisted. Fresh on each launch. Reasoning: dead wielders shouldn't auto-resurrect tabs at startup; if you need a wielder's chat, it's one click from the party row.

## Implementation surface

| File | Change |
|---|---|
| `src/renderer/src/ui/floating/panel-store.ts` | New kind `"chat-drawer"`. Singleton (only ever one). Drawer-specific state slice for `openTabs: string[]`, `activeTab: string`, `width: number`. |
| `src/renderer/src/ui/floating/ChatDrawerBody.tsx` | **NEW.** Tab bar at top (with status dot per tab), ConversationStream + chat input below for the active tab. |
| `src/renderer/src/ui/floating/FloatingPanel.tsx` | Drawer mode: anchored right, full height, drag handle on the LEFT edge for resize (instead of header drag). No close-X (closing handled per-tab). |
| `src/renderer/src/ui/floating/WielderPanelBody.tsx` | Drop the `Status / Messages` tab. Body becomes status-only. Add a "💬 Chat" action button in the verb row. |
| `src/renderer/src/ui/hud/PartyRow.tsx` | Wire the existing 💬 shortcut button to `openDrawerTab(unitId)` instead of opening the wielder panel's Messages tab. |
| `src/renderer/src/ui/ActivityLog.tsx` | When a row click would open the wielder's Messages tab, route to `openDrawerTab` + scroll-to-event instead. |
| `src/renderer/src/ui/hud/AlertsHUD.tsx` | Bump z-index so it stays above the drawer when both are visible. CSS class change. |
| `src/renderer/src/styles.css` | New `.chat-drawer` rules: anchored right, 50% default width, slide-in transform animation, left-edge resize handle. |

Estimated size: 300–500 LOC across ~7 files. No backend changes. No new IPC.

## Edge cases

- **Permission resolved in another surface** (e.g., user clicked allow in AlertsHUD card) → drawer tab's red dot clears next render
- **Wielder dies (session_end)** while their tab is open → tab stays open, conversation remains readable; status dot eventually goes neutral; chat input disabled (or shows "session ended" with a note about how to revive via observed-resume)
- **Drawer width clamps** — minimum 360px, maximum 80% of viewport
- **Many tabs (>6)** — horizontal scroll on tab bar with subtle gradient mask edges; "show all" overflow chevron at the right end
- **Drawer open + Wielder panel open for same wielder** — both work independently (per decision 6); status panel and drawer tab show the same data through different lenses

## Out of scope (explicitly)

- Detaching a tab into its own OS window (could be a future "pop-out" affordance — won't ship in v1)
- Reordering tabs by drag (browser-style append-on-right is enough for v1)
- Tab grouping / pinning (not needed at expected wielder counts)
- Compact mode / mini drawer (the slide-out + close paradigm is the compact mode)
- Persisting open tabs across restarts (decision 7)

## Testing

- **Manual smoke**:
  - Open one wielder via party row 💬 → drawer slides in, one tab
  - Open second wielder → second tab appears, focused
  - Per-tab `×` closes that tab; closing the last tab closes the drawer
  - Resize drawer via left-edge drag → width persists across page reload
  - Permission arrives for wielder A → red dot on tab A; AlertsHUD card visible above the drawer
  - Click the AlertsHUD card → drawer tab focuses A (or stays); after allow/deny, red dot clears
- **Fixture**: a "drawer-stress" scenario in `fixture.ts` that opens 5 wielders in quick succession, fires permission requests on alternating ones — exercises tab overflow + status-dot priority

## Sequencing with observed-resume

This plan can ship **before, after, or alongside** `observed-resume.md`:

- **Independently**: improves UX for spawned wielders today
- **Pairs well**: the resume work makes the chat input the only way to drive observed wielders, which raises the bar on chat-input ergonomics — the drawer is the right home for that
- **Recommendation**: do `observed-resume` first (the harder bit, smaller surface), then `chat-drawer` to make all chat (spawned + observed) feel native
