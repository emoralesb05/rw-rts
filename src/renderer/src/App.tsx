import { Topbar } from "./ui/Topbar";
import { CommandInput } from "./ui/CommandInput";
import { DecreeModal } from "./ui/DecreeModal";
import { ActivityLog } from "./ui/ActivityLog";
import { PanelLayer } from "./ui/floating/PanelLayer";
import { PhaserGame } from "./game/PhaserGame";
import { WielderHUD } from "./ui/hud/WielderHUD";
import { AlertsHUD } from "./ui/hud/AlertsHUD";
import { LettersHUD } from "./ui/hud/LettersHUD";
import { KingdomHeader } from "./ui/hud/KingdomHeader";

/**
 * HUD-overlay layout (FFXIV-style):
 *
 *   ┌─ Topbar (app controls) ─────────────────────────────────────┐
 *   │           ┌── KingdomHeader ──┐                              │
 *   │ ┌─Wielder─┤                   ├─Alerts─┐                     │
 *   │ │  HUD   │  Kingdom (Phaser,  │  HUD   │                     │
 *   │ │        │  full-viewport     │        │                     │
 *   │ │        │  canvas)           │        │                     │
 *   │ ├─Activity┤                   ├─Letters┤                     │
 *   │ └────────┘                   └────────┘                     │
 *   │                                                              │
 *   │ ─ CommandInput (bottom strip) ─────────────────────────────  │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Each HUD widget is a glass-pane overlay anchored to its corner.
 * Per Q40: throne side panel is gone; kingdom canvas IS the throne.
 */
export function App() {
  return (
    <div className="app">
      <Topbar />
      <div className="stage">
        <PhaserGame />
        <KingdomHeader />
        <WielderHUD />
        <AlertsHUD />
        <ActivityLog />
        <LettersHUD />
      </div>
      <CommandInput />
      <DecreeModal />
      <PanelLayer />
    </div>
  );
}
