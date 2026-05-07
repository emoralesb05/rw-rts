import { DecreeModal } from "./ui/DecreeModal";
import { ActivityLog } from "./ui/ActivityLog";
import { PanelLayer } from "./ui/floating/PanelLayer";
import { PhaserGame } from "./game/PhaserGame";
import { WielderHUD } from "./ui/hud/WielderHUD";
import { AlertsHUD } from "./ui/hud/AlertsHUD";
import { LettersHUD } from "./ui/hud/LettersHUD";
import { KingdomHeader } from "./ui/hud/KingdomHeader";
import { CommandPalette } from "./ui/CommandPalette";
import { TooltipProvider } from "./components/primitives/Tooltip";

/**
 * HUD-overlay layout (FFXIV-style, no chrome bars):
 *
 *   ┌─ thin invisible drag strip (12px) ────────────────────────┐
 *   │           ┌── KingdomHeader pill ──┐                       │
 *   │ ┌─Wielder─┤   (stats + 🔊 + ⚙)    ├─Alerts─┐               │
 *   │ │  HUD   │                          │  HUD   │   ✕N chip   │
 *   │ │  + dispatch button → Dispatch dialog       │             │
 *   │ │        │  Kingdom (Phaser,        │        │             │
 *   │ │        │  full-viewport canvas)   │        │             │
 *   │ ├─Activity┤                         ├─Letters┤             │
 *   │ └────────┘                         └────────┘              │
 *   └────────────────────────────────────────────────────────────┘
 *
 * No bottom command bar — spawning lives in the Dispatch dialog,
 * messaging lives inside the right-edge ChatDrawer (one tab per
 * wielder). Window-drag is the thin strip at top.
 */
export function App() {
  return (
    <TooltipProvider delayDuration={250}>
      <div className="app">
        <div className="window-drag-strip" />
        <div className="stage">
          <PhaserGame />
          <KingdomHeader />
          <WielderHUD />
          <AlertsHUD />
          <ActivityLog />
          <LettersHUD />
        </div>
        <DecreeModal />
        <PanelLayer />
        <CommandPalette />
      </div>
    </TooltipProvider>
  );
}
