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
  ARCHETYPE_TITLE,
} from "../role-archetype";
import { AgentToolBadge } from "../AgentToolBadge";
import { ArchetypeChip } from "../ArchetypeChip";
import { Bar } from "../../components/chrome/Bar";
import { IconButton } from "../../components/chrome/IconButton";
import { TooltipHint } from "../../components/chrome/TooltipHint";
import { cn } from "@/lib/cn";
import type { UnitState } from "@shared/events";

function statusIconClass(cls: string) {
  switch (cls) {
    case "drive-valor":
      return "border-[#ff5a3c]/50 bg-[#ff5a3c]/10 text-[#ff5a3c]";
    case "drive-wisdom":
      return "border-accent/50 bg-accent/10 text-accent";
    case "drive-final":
      return "border-accent-alt/50 bg-accent-alt/10 text-accent-alt";
    case "casting":
      return "border-[#c9a4ff]/50 bg-[#c9a4ff]/10 text-[#c9a4ff] animate-[status-pulse_1.4s_ease-in-out_infinite]";
    case "order":
      return "border-success/50 bg-success/10 text-success";
    case "danger":
      return "border-[#ff5a3c]/70 bg-[#ff5a3c]/20 text-[#ff5a3c] animate-[status-pulse_1s_ease-in-out_infinite]";
    default:
      return "border-transparent bg-white/5 text-muted";
  }
}

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
      <div className="relative mt-0.5 flex h-2 items-center overflow-hidden rounded-sm border border-black/50 bg-black/45 font-mono text-[7.5px] leading-none text-text">
        <div className="absolute inset-0 animate-[cast-sweep_0.9s_linear_infinite] bg-[length:24px_24px] bg-[repeating-linear-gradient(-45deg,rgba(201,164,255,0.45)_0,rgba(201,164,255,0.45)_6px,rgba(157,107,255,0.20)_6px,rgba(157,107,255,0.20)_12px)]" />
        <span className="relative z-[1] overflow-hidden text-ellipsis whitespace-nowrap px-1 tracking-[0.2px] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
          {label}
        </span>
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
    <span className="ml-auto flex shrink-0 gap-0.5">
      {icons.map((i) => (
        <TooltipHint key={i.key} label={i.title}>
          <span
            className={cn(
              "inline-flex size-4 items-center justify-center rounded-sm border text-[10px] font-bold",
              statusIconClass(i.cls)
            )}
          >
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
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md border border-white/[0.06]",
        "bg-[#0a1130]/55 px-2 py-1.5 text-left font-[inherit] text-inherit",
        "transition-colors hover:border-accent-alt/30 hover:bg-[#0a1130]/80",
        ghosted && "opacity-40",
        hasPanelOpen &&
          "border-accent-alt bg-accent-alt/10 shadow-[inset_2px_0_0_var(--color-accent-alt)]"
      )}
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
        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10"
        style={{ background: ROLE_HEX[unit.role] }}
      >
        <img
          className="size-full object-cover [image-rendering:pixelated]"
          src={`/sprites/kh-default/${unit.role}.png`}
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-text">
            {unit.displayName}
          </span>
          <AgentToolBadge tool={unit.tool} />
          <TooltipHint label={ARCHETYPE_TITLE[archetype]}>
            <ArchetypeChip archetype={archetype} />
          </TooltipHint>
          <StatusIcons unit={unit} hasOrder={hasOrder} />
        </div>
        <div className="mt-0.5 flex flex-col gap-0.5">
          <TooltipHint label={`HP ${Math.round(hpPct)}/100`}>
            <Bar
              className="h-1.5 rounded-sm border border-black/50 bg-black/45 shadow-inner"
              tone="hp"
              value={hpPct}
              aria-label={`${unit.displayName} HP`}
            />
          </TooltipHint>
          <TooltipHint label={`MP ${Math.round(mpPct)}/100`}>
            <Bar
              className="h-1.5 rounded-sm border border-black/50 bg-black/45 shadow-inner"
              tone="mp"
              value={mpPct}
              aria-label={`${unit.displayName} MP`}
            />
          </TooltipHint>
        </div>
        <CastBar unit={unit} />
      </div>
      <TooltipHint label="open chat in the drawer">
        <IconButton
          type="button"
          variant="ghost"
          size="md"
          className="ml-1 self-center text-muted hover:border-accent-alt hover:bg-accent-alt/10 hover:text-accent-alt"
          onClick={(e) => {
            e.stopPropagation();
            openChat();
          }}
          aria-label={`Open chat with ${unit.displayName}`}
        >
          <MessageSquare size={14} aria-hidden />
        </IconButton>
      </TooltipHint>
    </div>
  );
}
