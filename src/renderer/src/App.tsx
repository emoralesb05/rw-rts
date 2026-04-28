import { Topbar } from "./ui/Topbar";
import { ChatPanel } from "./ui/ChatPanel";
import { UnitDock } from "./ui/UnitDock";
import { CommandInput } from "./ui/CommandInput";
import { WorldNav } from "./ui/WorldNav";
import { ThroneRoom } from "./ui/ThroneRoom";
import { PhaserGame } from "./game/PhaserGame";
import { useStore } from "./store";

export function App() {
  const view = useStore((s) => s.view);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const showThrone = view === "throne" && activeWorldId === null;
  return (
    <div className="app">
      <Topbar />
      <div className="stage">
        <WorldNav />
        <PhaserGame />
        {showThrone && <ThroneRoom />}
        {!showThrone && <UnitDock />}
      </div>
      <aside className="side">
        <ChatPanel />
        <CommandInput />
      </aside>
    </div>
  );
}
