/**
 * Compact party-list row used inside the WielderHUD. Portrait, name +
 * tool pill, status icon strip, dual HP/MP mini bars, chat shortcut.
 *
 * Click body  → open wielder Status panel.
 * Click chat  → open a chat-drawer tab for this wielder.
 */
import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useStore } from "../../store";
import { ROLE_HEX, ROLE_PALETTE } from "../../game/units";
import { usePanels } from "../floating/panel-store";
import {
  classifyArchetype,
  ARCHETYPE_GLYPH,
  ARCHETYPE_TITLE,
} from "../role-archetype";
import { Bar } from "../../components/chrome/Bar";
import { TooltipHint } from "../../components/chrome/TooltipHint";
import type { AgentTool, UnitState } from "@shared/events";

const TOOL_LABEL: Record<AgentTool, string> = {
  claude: "Claude",
  cursor: "Cursor",
  codex: "Codex",
  gemini: "Gemini",
};

/** Slim live progress bar shown when a wielder is mid tool-call.
 * Renders only while status is "casting" or "working". Re-renders
 * once a second so the elapsed-time text stays current. */
function CastBar({ unit }: { unit: UnitState }) {
  const isCasting = unit.status === "casting" || unit.status === "working";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isCasting) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isCasting]);
  if (!isCasting) return null;
  const elapsedMs = Math.max(0, now - unit.lastActivity);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const label = `${unit.lastTool ?? unit.status} · ${elapsedSec}s`;
  return (
    <TooltipHint label={label}>
      <div className="party-row-cast">
        <div className="party-row-cast-fill" />
        <span className="party-row-cast-label">{label}</span>
      </div>
    </TooltipHint>
  );
}

/** Status icons row — small chips for "what is this wielder doing right now." */
function StatusIcons({ unit, hasOrder }: { unit: UnitState; hasOrder: boolean }) {
  const icons: { key: string; glyph: string; title: string; cls: string }[] = [];
  if (unit.driveForm) {
    icons.push({
      key: "drive",
      glyph:
        unit.driveForm === "valor"
          ? "⚡"
          : unit.driveForm === "wisdom"
          ? "✦"
          : "★",
      title: `${unit.driveForm} form active`,
      cls: `drive-${unit.driveForm}`,
    });
  }
  if (unit.status === "casting" || unit.status === "working") {
    icons.push({
      key: "casting",
      glyph: "◐",
      title: `${unit.status}…`,
      cls: "casting",
    });
  }
  if (hasOrder) {
    icons.push({
      key: "order",
      glyph: "⟲",
      title: "standing order active",
      cls: "order",
    });
  }
  if (unit.hp < 25 && unit.status !== "fallen") {
    icons.push({ key: "low", glyph: "!", title: "HP critical", cls: "danger" });
  }
  if (icons.length === 0) return null;
  return (
    <span className="status-icons">
      {icons.map((i) => (
        <TooltipHint key={i.key} label={i.title}>
          <span className={`status-icon status-${i.cls}`}>
            {i.glyph}
          </span>
        </TooltipHint>
      ))}
    </span>
  );
}

export function PartyRow({ unit }: { unit: UnitState }) {
  const palette = ROLE_PALETTE[unit.role];
  const selectUnit = useStore((s) => s.selectUnit);
  const openPanel = usePanels((s) => s.openPanel);
  const openDrawerTab = usePanels((s) => s.openDrawerTab);
  const panels = usePanels((s) => s.panels);
  const standingOrders = useStore((s) => s.standingOrders);
  const events = useStore((s) => s.events);
  const archetype = classifyArchetype(unit.id, events);
  const hasOrder = Object.values(standingOrders).some(
    (o) => o.unitId === unit.id && o.status === "active"
  );
  const hpPct = Math.max(0, Math.min(100, unit.hp));
  const mpPct = Math.max(0, Math.min(100, unit.mp));
  const ghosted = unit.status === "complete" || unit.status === "fallen";
  const hasPanelOpen = panels.some(
    (p) => p.kind === "wielder" && p.key === unit.id
  );
  const openWielder = () => {
    selectUnit(unit.id);
    openPanel({
      kind: "wielder",
      key: unit.id,
      title: `${unit.displayName} · ${unit.tool}`,
      width: 560,
    });
  };
  const openChat = () => {
    selectUnit(unit.id);
    openDrawerTab(unit.id);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className={
        "party-row" +
        (ghosted ? " ghosted" : "") +
        (hasPanelOpen ? " selected" : "")
      }
      onClick={() => openWielder()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openWielder();
        }
      }}
      aria-label={`${unit.displayName} · ${palette.faction}`}
    >
      <div
        className="party-row-portrait"
        style={{ background: ROLE_HEX[unit.role] }}
      >
        <img
          src={`/sprites/kh-default/${unit.role}.png`}
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div className="party-row-body">
        <div className="party-row-line">
          <span className="party-row-name">{unit.displayName}</span>
          <span className={`tool-pill tool-${unit.tool}`}>
            {TOOL_LABEL[unit.tool]}
          </span>
          <TooltipHint label={ARCHETYPE_TITLE[archetype]}>
            <span
              className={`archetype-chip archetype-${archetype}`}
              aria-label={`Behavior class: ${archetype}`}
            >
              {ARCHETYPE_GLYPH[archetype]}
            </span>
          </TooltipHint>
          <StatusIcons unit={unit} hasOrder={hasOrder} />
        </div>
        <div className="party-row-bars">
          <TooltipHint label={`HP ${Math.round(hpPct)}/100`}>
            <Bar
              className="bar-mini hp"
              tone="hp"
              value={hpPct}
              aria-label={`${unit.displayName} HP`}
            />
          </TooltipHint>
          <TooltipHint label={`MP ${Math.round(mpPct)}/100`}>
            <Bar
              className="bar-mini mp"
              tone="mp"
              value={mpPct}
              aria-label={`${unit.displayName} MP`}
            />
          </TooltipHint>
        </div>
        <CastBar unit={unit} />
      </div>
      <TooltipHint label="open chat in the drawer">
        <button
          type="button"
          className="party-row-chat"
          onClick={(e) => {
            e.stopPropagation();
            openChat();
          }}
          aria-label={`Open chat with ${unit.displayName}`}
        >
          <MessageSquare size={14} aria-hidden />
        </button>
      </TooltipHint>
    </div>
  );
}
