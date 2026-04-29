/**
 * Compact party-list row used inside the WielderHUD. Portrait, name +
 * tool pill, status icon strip, dual HP/MP mini bars, chat shortcut.
 *
 * Click body → open wielder panel on Status tab.
 * Click 💬     → open wielder panel on Messages tab.
 */
import { useStore } from "../../store";
import { ROLE_HEX, ROLE_PALETTE } from "../../game/units";
import { usePanels } from "../floating/panel-store";
import {
  classifyArchetype,
  ARCHETYPE_GLYPH,
  ARCHETYPE_TITLE,
} from "../role-archetype";
import type { AgentTool, UnitState } from "@shared/events";

const TOOL_LABEL: Record<AgentTool, string> = {
  claude: "Claude",
  cursor: "Cursor",
  codex: "Codex",
};

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
        <span
          key={i.key}
          className={`status-icon status-${i.cls}`}
          title={i.title}
        >
          {i.glyph}
        </span>
      ))}
    </span>
  );
}

export function PartyRow({ unit }: { unit: UnitState }) {
  const palette = ROLE_PALETTE[unit.role];
  const selectUnit = useStore((s) => s.selectUnit);
  const openPanel = usePanels((s) => s.openPanel);
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
  const openWielder = (initialTab?: "messages") => {
    selectUnit(unit.id);
    openPanel({
      kind: "wielder",
      key: unit.id,
      title: `${unit.displayName} · ${unit.tool}`,
      width: 420,
      data: initialTab ? { initialTab, tick: Date.now() } : undefined,
    });
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
      title={`${unit.displayName} · ${palette.faction}`}
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
          <span
            className={`archetype-chip archetype-${archetype}`}
            title={ARCHETYPE_TITLE[archetype]}
            aria-label={`Behavior class: ${archetype}`}
          >
            {ARCHETYPE_GLYPH[archetype]}
          </span>
          <StatusIcons unit={unit} hasOrder={hasOrder} />
        </div>
        <div className="party-row-bars">
          <div className="bar-mini hp" title={`HP ${Math.round(hpPct)}/100`}>
            <div style={{ width: `${hpPct}%` }} />
          </div>
          <div className="bar-mini mp" title={`MP ${Math.round(mpPct)}/100`}>
            <div style={{ width: `${mpPct}%` }} />
          </div>
        </div>
      </div>
      <button
        type="button"
        className="party-row-chat"
        onClick={(e) => {
          e.stopPropagation();
          openWielder("messages");
        }}
        title="open messages tab"
        aria-label={`Open messages with ${unit.displayName}`}
      >
        💬
      </button>
    </div>
  );
}
