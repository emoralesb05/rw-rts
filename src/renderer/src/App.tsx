import { Topbar } from "./ui/Topbar";
import { ChatPanel } from "./ui/ChatPanel";
import { UnitInspector } from "./ui/UnitInspector";
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
      </div>
      <aside className="side">
        <UnitInspector />
        <ChatPanel />
        <CommandInput />
      </aside>
    </div>
  );
}
