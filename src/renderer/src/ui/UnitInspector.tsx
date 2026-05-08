import { Volume2, VolumeX } from "lucide-react";
import { useStore } from "../store";
import { ROLE_HEX } from "../game/units";
import { Bar } from "../components/chrome/Bar";
import { IconButton } from "../components/chrome/IconButton";
import { TooltipHint } from "../components/chrome/TooltipHint";
import { cn } from "@/lib/cn";

export function UnitInspector() {
  const selectedUnitId = useStore((s) => s.selectedUnitId);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const units = useStore((s) => s.units);
  const selectUnit = useStore((s) => s.selectUnit);
  const muted = useStore((s) => s.mutedSessionIds);
  const toggleMute = useStore((s) => s.toggleMute);

  const list = Object.values(units).filter(
    (u) => !activeWorldId || u.worldId === activeWorldId
  );
  const selected = selectedUnitId ? units[selectedUnitId] : null;

  return (
    <div className="border-b border-line px-3.5 py-3">
      <h3 className="mb-2 mt-0 text-[11px] uppercase tracking-[1px] text-muted">
        Units
      </h3>
      {list.length === 0 && (
        <div className="text-xs text-muted">no units yet</div>
      )}
      {list.map((u) => {
        const isSel = u.id === selectedUnitId;
        return (
          <div
            key={u.id}
            className={cn(
              "my-1.5 flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface-2/45 px-2 py-1.5 text-[12px]",
              isSel && "border-l-[3px] border-l-accent pl-2 opacity-100",
              !isSel &&
                (u.status === "complete" || u.status === "fallen") &&
                "opacity-55"
            )}
            onClick={() => selectUnit(isSel ? null : u.id)}
          >
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ background: ROLE_HEX[u.role] }}
            />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {u.displayName}{" "}
                <span className="text-[11px] text-muted">
                  · {u.tool} · {u.status}
                </span>
              </div>
              <div className="text-[11px] text-muted">
                {u.cwd.split("/").slice(-2).join("/")}
              </div>
              <Bar
                className="mt-1 h-2 rounded-sm border border-black/60 bg-black/55 shadow-inner"
                tone="hp"
                value={u.hp}
                aria-label={`${u.displayName} HP`}
              />
              <Bar
                className="mt-1 h-2 rounded-sm border border-black/60 bg-black/55 shadow-inner"
                tone="mp"
                value={u.mp}
                aria-label={`${u.displayName} MP`}
              />
            </div>
            <TooltipHint
              label={
                muted[u.sessionId]
                  ? "unmute — show events from this unit in the chat"
                  : "mute — hide events from this unit in the chat"
              }
            >
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                className="opacity-70 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute(u.sessionId);
                }}
                aria-label={muted[u.sessionId] ? "Unmute unit" : "Mute unit"}
              >
                {muted[u.sessionId] ? (
                  <VolumeX size={14} aria-hidden />
                ) : (
                  <Volume2 size={14} aria-hidden />
                )}
              </IconButton>
            </TooltipHint>
          </div>
        );
      })}
      {selected && (
        <div className="mt-2.5 text-[11px] text-muted">
          last tool: {selected.lastTool ?? "—"}
        </div>
      )}
    </div>
  );
}
