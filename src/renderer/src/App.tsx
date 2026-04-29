import { Topbar } from "./ui/Topbar";
import { ChatPanel } from "./ui/ChatPanel";
import { CommandInput } from "./ui/CommandInput";
import { ThroneRoom } from "./ui/ThroneRoom";
import { DecreeModal } from "./ui/DecreeModal";
import { PhaserGame } from "./game/PhaserGame";

/**
 * Unified-map layout (per Q40 in vision.md):
 *   Topbar
 *   ┌──────────┬─────────────────────────┬─────────────┐
 *   │ Throne   │  Kingdom (Phaser)       │  Chat       │
 *   │ side     │  pan/zoom Star Chart    │  + input    │
 *   │ panel    │  fills the middle       │             │
 *   └──────────┴─────────────────────────┴─────────────┘
 *
 * No more tab nav (Throne / Gummi / per-world). Throne is always visible
 * as a left-side overlay; the unified Kingdom canvas takes the bulk of
 * the stage; chat + command input on the right (unchanged).
 */
export function App() {
  return (
    <div className="app">
      <Topbar />
      <div className="stage">
        <ThroneRoom />
        <PhaserGame />
      </div>
      <aside className="side">
        <ChatPanel />
        <CommandInput />
      </aside>
      <DecreeModal />
    </div>
  );
}
