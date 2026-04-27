import { Topbar } from "./ui/Topbar";
import { ChatPanel } from "./ui/ChatPanel";
import { UnitDock } from "./ui/UnitDock";
import { CommandInput } from "./ui/CommandInput";
import { WorldNav } from "./ui/WorldNav";
import { PhaserGame } from "./game/PhaserGame";

export function App() {
  return (
    <div className="app">
      <Topbar />
      <div className="stage">
        <WorldNav />
        <PhaserGame />
        <UnitDock />
      </div>
      <aside className="side">
        <ChatPanel />
        <CommandInput />
      </aside>
    </div>
  );
}
