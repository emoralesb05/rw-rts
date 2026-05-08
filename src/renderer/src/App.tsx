import { DecreeModal } from "./ui/DecreeModal";
import { ActivityLog } from "./ui/ActivityLog";
import { PanelLayer } from "./ui/floating/PanelLayer";
import { PhaserGame } from "./game/PhaserGame";
import { WielderHUD } from "./ui/hud/WielderHUD";
import { AlertsHUD } from "./ui/hud/AlertsHUD";
import { LettersHUD } from "./ui/hud/LettersHUD";
import { KingdomHeader } from "./ui/hud/KingdomHeader";
import { CommandPalette } from "./ui/CommandPalette";
import { TooltipProvider } from "./ui/components/primitives/Tooltip";
import { AppToastProvider } from "./ui/components/kit/ToastLayer";

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
      <AppToastProvider>
        <div className="grid h-screen grid-cols-1 grid-rows-1">
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-8 [-webkit-app-region:drag]" />
          <div className="relative block min-h-0 min-w-0 overflow-hidden bg-[#04060d] [&_canvas]:block">
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
      </AppToastProvider>
    </TooltipProvider>
  );
}
