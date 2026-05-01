/**
 * Wielder detail body — renders inside a FloatingPanel. Same content
 * the inline TargetPanel had: portrait, name + pills, mood/renown/world,
 * standing orders, full HP/MP/Focus bars, action card.
 *
 * If the unit no longer exists (session ended and was cleaned up), the
 * body shows a stub instead of crashing — the user can close the panel.
 */
import { useEffect } from "react";
import {
  ChevronRight,
  CornerDownRight,
  Heart,
  MapPin,
  MessageSquare,
  Power,
  RotateCw,
} from "lucide-react";
import { usePanels } from "./panel-store";
import { useStore, unitIdentityFor } from "../../store";
import { ROLE_HEX, ROLE_PALETTE } from "../../game/units";
import { themeFor, themeLabel } from "../../game/gummi-worlds";
import {
  classifyArchetype,
  ARCHETYPE_GLYPH,
  ARCHETYPE_LABEL,
  ARCHETYPE_TITLE,
} from "../role-archetype";
import type { AgentTool, UnitState, WielderStats } from "@shared/events";

const TOOL_LABEL: Record<AgentTool, string> = {
  claude: "Claude",
  cursor: "Cursor",
  codex: "Codex",
};

function moodFor(unit: UnitState): string {
  if (unit.status === "fallen") return "fallen";
  if (unit.status === "complete") return "complete";
  if (unit.hp < 25) return "desperate";
  if (unit.driveForm) return "triumphant";
  if (unit.status === "casting" || unit.status === "working") return "focused";
  if (unit.hp < 60) return "fatigued";
  return "eager";
}

function renownFor(stats: WielderStats | undefined) {
  if (!stats) return { tier: "New", stars: "", score: 0 };
  const score = stats.visits + stats.seals * 3 - stats.falls * 2;
  if (score >= 24) return { tier: "Hero", stars: "★★★", score };
  if (score >= 12) return { tier: "Veteran", stars: "★★", score };
  if (score >= 4) return { tier: "Apprentice", stars: "★", score };
  return { tier: "New", stars: "", score };
}

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 30_000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

type Props = {
  unitId: string;
};

export function WielderPanelBody({ unitId }: Props) {
  const unit = useStore((s) => s.units[unitId]);
  const worlds = useStore((s) => s.worlds);
  const events = useStore((s) => s.events);
  const standingOrders = useStore((s) => s.standingOrders);
  const persistedWielders = useStore((s) => s.persisted.wielders);
  const selectWorld = useStore((s) => s.selectWorld);
  const comfort = useStore((s) => s.comfort);
  const haltStandingOrder = useStore((s) => s.haltStandingOrder);
  const setPanelSize = usePanels((s) => s.setSize);
  const openDrawerTab = usePanels((s) => s.openDrawerTab);
  const archetype = unit ? classifyArchetype(unit.id, events) : "roamer";

  // Status panel is content-driven; reset any height a previous body
  // may have set so a re-opened panel sits at its natural height.
  useEffect(() => {
    setPanelSize(`wielder:${unitId}`, { width: 560, height: null });
  }, [unitId, setPanelSize]);

  if (!unit) {
    return (
      <div className="target-panel-empty">
        This wielder is no longer active.
      </div>
    );
  }

  const palette = ROLE_PALETTE[unit.role];
  const activeOrders = Object.values(standingOrders).filter(
    (o) => o.unitId === unit.id && o.status === "active"
  );
  const renown = renownFor(persistedWielders[unitIdentityFor(unit.tool, unit.cwd)]);
  const world = worlds[unit.worldId];
  const worldLabel = world?.label ?? "—";
  const themeName = world ? themeLabel(themeFor(world.id)) : "—";
  const hpPct = Math.max(0, Math.min(100, unit.hp));
  const mpPct = Math.max(0, Math.min(100, unit.mp));
  const focusPct = unit.driveForm ? 100 : 35;
  const ghosted = unit.status === "complete" || unit.status === "fallen";
  const canComfort =
    !ghosted && unit.hp < 100 && (world?.munny ?? 0) >= 50;

  return (
    <div className={"target-panel" + (ghosted ? " ghosted" : "")}>
      <div className="target-panel-head">
        <div
          className="target-panel-portrait"
          style={{ background: ROLE_HEX[unit.role] }}
          title={`${unit.displayName} — ${palette.faction}`}
        >
          <img
            src={`/sprites/kh-default/${unit.role}.png`}
            alt=""
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className="target-panel-info">
          <div className="target-panel-name-row">
            <span className="target-panel-name">{unit.displayName}</span>
            <span className={`tool-pill tool-${unit.tool}`}>
              {TOOL_LABEL[unit.tool]}
            </span>
            <span
              className={`origin-pill origin-${unit.spawnedHere ? "spawned" : "observed"}`}
              title={
                unit.spawnedHere
                  ? "spawned by keykeeper — you can send prompts here"
                  : "observed terminal session — read-only"
              }
            >
              {unit.spawnedHere ? "spawned" : "observed"}
            </span>
          </div>
          <div className="target-panel-meta">
            <span className="target-panel-mood">{moodFor(unit)}</span>
            <span
              className={`archetype-chip archetype-${archetype}`}
              title={ARCHETYPE_TITLE[archetype]}
            >
              {ARCHETYPE_GLYPH[archetype]}
              <span className="archetype-chip-label">
                {ARCHETYPE_LABEL[archetype]}
              </span>
            </span>
            <span
              className={`throne-card-renown rank-${renown.tier.toLowerCase()}`}
              title={`Renown: ${renown.score} (${renown.tier})`}
            >
              {renown.stars && (
                <span className="throne-card-renown-stars">{renown.stars}</span>
              )}
              <span className="throne-card-renown-tier">{renown.tier}</span>
            </span>
            <button
              type="button"
              className="throne-card-world-link"
              onClick={() => selectWorld(unit.worldId)}
              title="dive into this world"
            >
              <ChevronRight size={11} aria-hidden /> {worldLabel} · {themeName}
            </button>
          </div>
        </div>
      </div>
      {activeOrders.length > 0 && (
        <div className="target-panel-orders">
          {activeOrders.map((o) => (
            <button
              key={o.id}
              type="button"
              className="standing-order-chip"
              onClick={() => haltStandingOrder(o.id)}
              title={`Standing Order — ${o.iterationsRun}/${o.maxIterations} iterations · click to halt`}
            >
              <RotateCw size={11} aria-hidden /> {Math.round(o.intervalMs / 60_000)}m · {o.iterationsRun}/{o.maxIterations} · halt
            </button>
          ))}
        </div>
      )}
      <div className="target-panel-bars">
        <div className="bar-row">
          <span className="bar-label">HP</span>
          <div className="bar hp">
            <div style={{ width: `${hpPct}%` }} />
          </div>
          <span className="bar-num">{Math.round(hpPct)}</span>
        </div>
        <div className="bar-row">
          <span className="bar-label">MP</span>
          <div className="bar mp">
            <div style={{ width: `${mpPct}%` }} />
          </div>
          <span className="bar-num">{Math.round(mpPct)}</span>
        </div>
        <div className="bar-row">
          <span className="bar-label">FC</span>
          <div className="bar focus">
            <div style={{ width: `${focusPct}%` }} />
          </div>
          <span className="bar-num">{unit.driveForm ?? "—"}</span>
        </div>
      </div>
      <div className="target-panel-foot">
        <span className="throne-card-time">{timeAgo(unit.lastActivity)}</span>
        {unit.lastTool && (
          <span className="target-panel-lasttool" title="last tool call">
            <CornerDownRight size={11} aria-hidden /> {unit.lastTool}
          </span>
        )}
      </div>
      <div className="target-panel-actions">
        <button
          type="button"
          className="card-verb"
          disabled={ghosted}
          onClick={() => openDrawerTab(unit.id)}
          title="open chat in the drawer"
        >
          <MessageSquare size={11} aria-hidden /> chat
        </button>
        <button
          type="button"
          className="card-verb"
          disabled={ghosted}
          onClick={() => selectWorld(unit.worldId)}
          title="find — pan camera to this wielder's world"
        >
          <MapPin size={11} aria-hidden /> find
        </button>
        <button
          type="button"
          className="card-verb decree"
          disabled={ghosted || !unit.spawnedHere}
          onClick={() => useStore.getState().openDecreeFor(unit.id)}
          title={
            !unit.spawnedHere
              ? "observed-only — keykeeper didn't spawn this wielder"
              : "decree — directive command (file/function/shell)"
          }
        >
          {/* ⚜ stays as the gold royal sigil — KH-themed and intentional. */}
          ⚜ decree
        </button>
        <button
          type="button"
          className="card-verb"
          disabled={!canComfort}
          onClick={() => comfort(unit.id)}
          title={
            canComfort
              ? "restore +30 HP for 50µ"
              : ghosted
              ? "this wielder is no longer active"
              : unit.hp >= 100
              ? "already at full HP"
              : "not enough munny in this world (need 50µ)"
          }
        >
          <Heart size={11} aria-hidden /> comfort
        </button>
        <button
          type="button"
          className="card-verb destructive"
          // Recall calls window.kh.killAgent, which only knows about
          // processes keykeeper spawned. For hook-observed wielders it
          // would silently no-op; gate the same way decree does so the
          // button reflects what's actually possible.
          disabled={ghosted || !unit.spawnedHere}
          onClick={() => {
            if (confirm(`Recall ${unit.displayName}? This ends the session.`)) {
              void window.kh.killAgent(unit.id).catch(() => {});
            }
          }}
          title={
            !unit.spawnedHere
              ? "observed-only — keykeeper didn't spawn this wielder, no process to recall"
              : "recall — end this session"
          }
        >
          <Power size={11} aria-hidden /> recall
        </button>
      </div>
    </div>
  );
}
