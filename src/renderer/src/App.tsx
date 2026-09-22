import { useState } from "react";
import { DecreeModal } from "./ui/DecreeModal";
import { ActivityLog } from "./ui/ActivityLog";
import { PanelLayer } from "./ui/floating/PanelLayer";
import { PhaserGame } from "./game/PhaserGame";
import { WielderHUD } from "./ui/hud/WielderHUD";
import { AlertsHUD } from "./ui/hud/AlertsHUD";
import { LettersHUD } from "./ui/hud/LettersHUD";
import { KingdomHeader } from "./ui/hud/KingdomHeader";
import { WorldCommandHUD } from "./ui/hud/WorldCommandHUD";
import { CommandPalette } from "./ui/CommandPalette";
import { TooltipProvider } from "./ui/components/primitives/Tooltip";
import { AppToastProvider } from "./ui/components/kit/ToastLayer";
import { MonitorWorkspace } from "./monitoring/MonitorWorkspace";

type WorkspaceMode = "monitor" | "realm";
const WORKSPACE_MODE_KEY = "realmkeeper:workspace-mode";

/**
 * HUD-overlay layout (FFXIV-style, no app bars):
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
  const [mode, setModeState] = useState<WorkspaceMode>(initialWorkspaceMode);
  const setMode = (next: WorkspaceMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(WORKSPACE_MODE_KEY, next);
    } catch {
      // A locked-down renderer can still switch for the current session.
    }
  };

  return (
    <TooltipProvider delayDuration={250}>
      <AppToastProvider>
        {mode === "monitor" ? (
          <MonitorWorkspace onOpenRealm={() => setMode("realm")} />
        ) : (
          <RealmWorkspace onOpenMonitor={() => setMode("monitor")} />
        )}
      </AppToastProvider>
    </TooltipProvider>
  );
}

function RealmWorkspace({ onOpenMonitor }: { onOpenMonitor(): void }) {
  return (
    <div className="grid h-screen grid-cols-1 grid-rows-1">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-8 [-webkit-app-region:drag]" />
      <div className="fixed top-3 left-1/2 z-[250] flex -translate-x-1/2 rounded-md border border-[#2a3a6c] bg-[#0a0e1a]/90 p-0.5 shadow-lg backdrop-blur [-webkit-app-region:no-drag]">
        <button
          className="px-3 py-1 text-[11px] font-semibold text-[#8aa0d0] hover:text-[#e6ecff]"
          type="button"
          onClick={onOpenMonitor}
        >
          Monitor
        </button>
        <button
          className="rounded bg-[#6cc6ff] px-3 py-1 text-[11px] font-semibold text-[#0a0e1a]"
          type="button"
        >
          Realm
        </button>
      </div>
      <div className="relative block min-h-0 min-w-0 overflow-hidden bg-[#04060d] [&_canvas]:block">
        <PhaserGame />
        <KingdomHeader />
        <WielderHUD />
        <AlertsHUD />
        <ActivityLog />
        <WorldCommandHUD />
        <LettersHUD />
      </div>
      <DecreeModal />
      <PanelLayer />
      <CommandPalette />
    </div>
  );
}

function initialWorkspaceMode(): WorkspaceMode {
  if (new URLSearchParams(window.location.search).has("e2e")) return "realm";
  try {
    return window.localStorage.getItem(WORKSPACE_MODE_KEY) === "realm"
      ? "realm"
      : "monitor";
  } catch {
    return "monitor";
  }
}
