/**
 * Translucent floating strip at top-center — the de-facto top chrome.
 * Shows kingdom-level info (sealed / wielders / munny / age) plus the
 * two persistent action icons (mute toggle, Kingdom panel).
 *
 * The pill replaced the old topbar; window-drag has moved to a
 * separate invisible strip behind it.
 */
import { useState } from "react";
import { Settings, Volume2, VolumeX } from "lucide-react";
import { useStore } from "../../store";
import { isMuted, toggleMuted } from "../../audio/sounds";
import { usePanels } from "../floating/panel-store";
import { CloseAllChip } from "../CloseAllChip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/primitives/Tooltip";
import { Toolbar } from "../../components/chrome/Toolbar";

function fmtDays(foundedAt: number): string {
  const days = Math.max(0, Math.floor((Date.now() - foundedAt) / 86400_000));
  return days === 0 ? "today" : `${days}d`;
}

export function KingdomHeader() {
  const persisted = useStore((s) => s.persisted);
  const worlds = useStore((s) => s.worlds);
  const units = useStore((s) => s.units);
  const openPanel = usePanels((s) => s.openPanel);
  const [muted, setMuted] = useState(isMuted());
  const liveWielders = Object.values(units).filter(
    (u) => u.status !== "complete" && u.status !== "fallen"
  ).length;
  const sealedLifetime = Object.values(persisted.worlds).filter(
    (w) => w.sealedAt
  ).length;
  const sessionMunny = Object.values(worlds).reduce(
    (sum, w) => sum + (w.munny ?? 0),
    0
  );
  const totalMunny = Math.max(persisted.totalMunnyEver, sessionMunny);
  return (
    <div className="kingdom-header">
      <span className="kingdom-header-title">⌬ Keykeeper</span>
      <span className="kingdom-header-sep">·</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="kingdom-header-stat">✦ {sealedLifetime} sealed</span>
        </TooltipTrigger>
        <TooltipContent>sealed keyholes (lifetime)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="kingdom-header-stat">⚔ {liveWielders} wielders</span>
        </TooltipTrigger>
        <TooltipContent>active wielders</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="kingdom-header-stat">µ {totalMunny.toLocaleString()}</span>
        </TooltipTrigger>
        <TooltipContent>total munny earned</TooltipContent>
      </Tooltip>
      <span className="kingdom-header-sep">·</span>
      <span className="kingdom-header-meta">
        founded {fmtDays(persisted.kingdomFoundedAt)} ago
      </span>
      <Toolbar className="kingdom-header-actions" aria-label="Kingdom actions">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="kingdom-header-icon-btn"
              onClick={() => setMuted(toggleMuted())}
              aria-label={muted ? "unmute" : "mute"}
            >
              {muted ? <VolumeX size={14} aria-hidden /> : <Volume2 size={14} aria-hidden />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{muted ? "unmute" : "mute"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="kingdom-header-icon-btn"
              onClick={() =>
                openPanel({ kind: "kingdom", title: "Kingdom", width: 520 })
              }
              aria-label="Open Kingdom panel"
            >
              <Settings size={14} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>Kingdom — overview, settings, connection, demos</TooltipContent>
        </Tooltip>
      </Toolbar>
      {/* Floating "close all" chip — visually separate (own pill) but
       * absolutely positioned to the pill's right edge so it always
       * sits next to it regardless of pill width. */}
      <CloseAllChip />
    </div>
  );
}
