import { CommandInput } from "./ui/CommandInput";
import { DecreeModal } from "./ui/DecreeModal";
import { ActivityLog } from "./ui/ActivityLog";
import { PanelLayer } from "./ui/floating/PanelLayer";
import { PhaserGame } from "./game/PhaserGame";
import { WielderHUD } from "./ui/hud/WielderHUD";
import { AlertsHUD } from "./ui/hud/AlertsHUD";
import { LettersHUD } from "./ui/hud/LettersHUD";
import { KingdomHeader } from "./ui/hud/KingdomHeader";
import { CloseAllChip } from "./ui/CloseAllChip";

/**
 * HUD-overlay layout (FFXIV-style, no top toolbar):
 *
 *   ┌─ thin invisible drag strip (8px) ─────────────────────────┐
 *   │           ┌── KingdomHeader pill ──┐                       │
 *   │ ┌─Wielder─┤   (stats + 🔊 + ⚙)    ├─Alerts─┐               │
 *   │ │  HUD   │                          │  HUD   │   ✕N chip   │
 *   │ │        │  Kingdom (Phaser,        │        │   (top-right│
 *   │ │        │  full-viewport canvas)   │        │   when      │
 *   │ ├─Activity┤                         ├─Letters┤   panels    │
 *   │ └────────┘                         └────────┘   open)      │
 *   │ ─ CommandInput (bottom strip) ──────────────────────────── │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Window-drag region is the thin strip at the very top — gives Electron
 * something to grab without burning visible chrome real estate.
 * Mute + open-Kingdom moved into the KingdomHeader pill itself.
 */
export function App() {
  return (
    <div className="app">
      <div className="window-drag-strip" />
      <div className="stage">
        <PhaserGame />
        <KingdomHeader />
        <WielderHUD />
        <AlertsHUD />
        <ActivityLog />
        <LettersHUD />
        <CloseAllChip />
      </div>
      <CommandInput />
      <DecreeModal />
      <PanelLayer />
    </div>
  );
}
