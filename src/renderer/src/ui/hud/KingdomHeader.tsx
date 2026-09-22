/**
 * Translucent floating strip at top-center — the de-facto top HUD.
 * Shows kingdom-level info (sealed / wielders / glimmer / age) plus the
 * two persistent action icons (mute toggle, Kingdom panel).
 *
 * The pill replaced the old topbar; window-drag has moved to a
 * separate invisible strip behind it.
 */
import { useMemo, useState } from "react";
import {
  Activity,
  CircleCheck,
  Settings,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useStore } from "../../store";
import { isMuted, toggleMuted } from "../../audio/sounds";
import {
  createRealmSituation,
  nextRealmFrontId,
  type RealmSituation,
} from "../../game/realm-situation";
import { usePanels } from "../floating/panel-store";
import { CloseAllChip } from "../CloseAllChip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/primitives/Tooltip";
import { IconButton } from "../components/kit/IconButton";
import { Toolbar } from "../components/kit/Toolbar";

function fmtDays(foundedAt: number): string {
  const days = Math.max(0, Math.floor((Date.now() - foundedAt) / 86400_000));
  return days === 0 ? "today" : `${days}d ago`;
}

function situationLabel(situation: RealmSituation): string {
  if (situation.counts.pressure > 0) {
    return `${situation.counts.pressure} pressure`;
  }
  if (situation.counts.hold > 0) {
    return `${situation.counts.hold} hold${situation.counts.hold === 1 ? "" : "s"}`;
  }
  if (situation.counts.active > 0) {
    return `${situation.counts.active} active`;
  }
  return "realm calm";
}

export function KingdomHeader() {
  const persisted = useStore((s) => s.persisted);
  const worlds = useStore((s) => s.worlds);
  const units = useStore((s) => s.units);
  const letters = useStore((s) => s.letters);
  const events = useStore((s) => s.events);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const selectWorld = useStore((s) => s.selectWorld);
  const openPanel = usePanels((s) => s.openPanel);
  const [muted, setMuted] = useState(isMuted());
  const situation = useMemo(
    () => createRealmSituation({ worlds, units, letters, events }),
    [events, letters, units, worlds]
  );
  const nextFrontId = nextRealmFrontId(situation, activeWorldId);
  const liveWielders = Object.values(units).filter(
    (u) => u.status !== "complete" && u.status !== "fallen"
  ).length;
  const sealedLifetime = Object.values(persisted.worlds).filter(
    (w) => w.sealedAt
  ).length;
  const sessionGlimmer = Object.values(worlds).reduce(
    (sum, w) => sum + (w.glimmer ?? 0),
    0
  );
  const totalGlimmer = Math.max(persisted.totalGlimmerEver, sessionGlimmer);
  return (
    <div className="rounded-pill border-accent-alt/18 font-ui text-text absolute top-[38px] left-1/2 z-[51] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2.5 overflow-hidden border bg-[#0a1130]/48 px-4 py-1.5 text-xs whitespace-nowrap shadow-[0_18px_48px_rgba(0,0,0,0.32)] backdrop-blur-md">
      <span className="text-accent-alt text-[11px] font-bold tracking-[1.2px] uppercase">
        ⌬ Realmkeeper
      </span>
      <span className="text-muted opacity-50">·</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-text tabular-nums">
            ✦ {sealedLifetime} sealed
          </span>
        </TooltipTrigger>
        <TooltipContent>sealed realms (lifetime)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-text tabular-nums">
            ⚔ {liveWielders} wielders
          </span>
        </TooltipTrigger>
        <TooltipContent>active wielders</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={
              situation.overallState === "pressure"
                ? "text-danger border-danger/35 bg-danger/10 hover:bg-danger/15 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase transition-colors"
                : situation.overallState === "hold"
                  ? "text-warning border-warning/35 bg-warning/10 hover:bg-warning/15 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase transition-colors"
                  : situation.overallState === "active"
                    ? "text-accent-alt border-accent-alt/30 bg-accent-alt/10 hover:bg-accent-alt/15 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase transition-colors"
                    : "text-success border-success/25 bg-success/[0.07] inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase"
            }
            onClick={() => nextFrontId && selectWorld(nextFrontId)}
            disabled={!nextFrontId}
            aria-label={
              nextFrontId
                ? `Focus next kingdom front: ${situationLabel(situation)}`
                : situationLabel(situation)
            }
          >
            {situation.overallState === "pressure" ||
            situation.overallState === "hold" ? (
              <TriangleAlert size={11} aria-hidden />
            ) : situation.overallState === "active" ? (
              <Activity size={11} aria-hidden />
            ) : (
              <CircleCheck size={11} aria-hidden />
            )}
            {situationLabel(situation)}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {nextFrontId
            ? "Focus the next active or threatened world"
            : "No active world needs attention"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-text tabular-nums">
            ✧ {totalGlimmer.toLocaleString()}
          </span>
        </TooltipTrigger>
        <TooltipContent>total glimmer earned</TooltipContent>
      </Tooltip>
      <span className="text-muted opacity-50">·</span>
      <span className="text-muted text-[11px] italic">
        founded {fmtDays(persisted.kingdomFoundedAt)}
      </span>
      <Toolbar
        className="ml-1 border-l border-white/10 pl-2.5"
        aria-label="Kingdom actions"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              className="text-text hover:border-accent-alt/40 hover:bg-accent-alt/10 hover:text-accent-alt size-6"
              onClick={() => setMuted(toggleMuted())}
              aria-label={muted ? "unmute" : "mute"}
            >
              {muted ? (
                <VolumeX size={14} aria-hidden />
              ) : (
                <Volume2 size={14} aria-hidden />
              )}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>{muted ? "unmute" : "mute"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              className="text-text hover:border-accent-alt/40 hover:bg-accent-alt/10 hover:text-accent-alt size-6"
              onClick={() =>
                openPanel({ kind: "kingdom", title: "Kingdom", width: 520 })
              }
              aria-label="Open Kingdom panel"
            >
              <Settings size={14} aria-hidden />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>
            Kingdom — overview, settings, connection, demos
          </TooltipContent>
        </Tooltip>
        <CloseAllChip />
      </Toolbar>
    </div>
  );
}
