import { Volume2, VolumeX } from "lucide-react";
import { useStore } from "../store";
import { ROLE_HEX } from "../game/units";
import { Bar } from "./components/kit/Bar";
import { IconButton } from "./components/kit/IconButton";
import { TooltipHint } from "./components/kit/TooltipHint";
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
    <div className="border-line border-b px-3.5 py-3">
      <h3 className="text-muted mt-0 mb-2 text-[11px] tracking-[1px] uppercase">
        Units
      </h3>
      {list.length === 0 && (
        <div className="text-muted text-xs">no units yet</div>
      )}
      {list.map((u) => {
        const isSel = u.id === selectedUnitId;
        return (
          <div
            key={u.id}
            className={cn(
              "border-line bg-surface-2/45 my-1.5 flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-[12px]",
              isSel && "border-l-accent border-l-[3px] pl-2 opacity-100",
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
                <span className="text-muted text-[11px]">
                  · {u.tool} · {u.status}
                </span>
              </div>
              <div className="text-muted text-[11px]">
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
        <div className="text-muted mt-2.5 text-[11px]">
          last tool: {selected.lastTool ?? "—"}
        </div>
      )}
    </div>
  );
}
