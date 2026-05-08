/**
 * Top-left HUD: party list. Replaces the wielders section of the
 * old throne side panel. Sorts by spawn time (stable order). Clicking
 * a row opens the wielder panel; the chat icon opens it on Messages.
 */
import { useStore } from "../../store";
import { HudWidget } from "./HudWidget";
import { PartyRow } from "./PartyRow";
import { usePersistedBool } from "./hud-prefs";
import { usePanels } from "../floating/panel-store";
import { Button } from "../../components/kit/Button";
import { EmptyState } from "../../components/kit/EmptyState";
import { TooltipHint } from "../../components/kit/TooltipHint";
import { cn } from "@/lib/cn";

export function WielderHUD() {
  const units = useStore((s) => s.units);
  const openPanel = usePanels((s) => s.openPanel);
  // Hide completed/fallen wielders by default — they accumulate but
  // can't be acted on. Toggle persists so the user's preference sticks.
  const [showGhosted, setShowGhosted] = usePersistedBool("show-ghosted", false);
  const all = Object.values(units).sort(
    (a, b) => (a.spawnedAt ?? a.lastActivity) - (b.spawnedAt ?? b.lastActivity)
  );
  const ghostedCount = all.filter(
    (u) => u.status === "complete" || u.status === "fallen"
  ).length;
  const list = showGhosted
    ? all
    : all.filter((u) => u.status !== "complete" && u.status !== "fallen");
  const headerExtra = (
    <>
      {ghostedCount > 0 && (
        <TooltipHint
          label={
            showGhosted
              ? `Hide ${ghostedCount} completed/fallen wielders`
              : `Show ${ghostedCount} completed/fallen wielders`
          }
        >
          <button
            type="button"
            className={cn(
              "inline-flex min-h-6 items-center justify-center gap-1 rounded-sm border px-2 py-0.5",
              "text-[10px] font-bold uppercase tracking-[0.5px] transition-colors",
              showGhosted
                ? "border-accent-alt bg-accent-alt/20 text-accent-alt"
                : "border-white/20 bg-transparent text-muted hover:border-accent-alt hover:text-accent-alt"
            )}
            onClick={() => setShowGhosted((v) => !v)}
            aria-pressed={showGhosted}
          >
            ✦ {ghostedCount}
          </button>
        </TooltipHint>
      )}
      <TooltipHint
        label="dispatch a wielder — opens the spawn dialog"
      >
        <Button
          type="button"
          className="min-h-6 border-accent-alt/30 bg-accent-alt/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.5px] text-accent-alt hover:border-accent-alt hover:bg-accent-alt/20"
          onClick={() =>
            openPanel({ kind: "dispatch", title: "Dispatch", width: 480 })
          }
          aria-label="Dispatch a wielder"
        >
          + dispatch
        </Button>
      </TooltipHint>
    </>
  );
  return (
    <HudWidget
      anchor="top-left"
      title="Wielders"
      count={list.length}
      headerExtra={headerExtra}
    >
      {list.length === 0 ? (
        <EmptyState className="min-h-0 bg-transparent px-2 py-3">
          {all.length === 0
            ? "The kingdom is quiet. Spawn or run an agent to begin."
            : "All active wielders done. Toggle ✦ to see history."}
        </EmptyState>
      ) : (
        <div className="mt-2.5 flex flex-col gap-1">
          {list.map((u) => (
            <PartyRow key={u.id} unit={u} />
          ))}
        </div>
      )}
    </HudWidget>
  );
}
