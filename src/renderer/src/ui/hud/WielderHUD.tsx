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
        <button
          type="button"
          className={
            "hud-action-btn hud-action-btn-toggle" +
            (showGhosted ? " active" : "")
          }
          onClick={() => setShowGhosted((v) => !v)}
          title={
            showGhosted
              ? `Hide ${ghostedCount} completed/fallen wielders`
              : `Show ${ghostedCount} completed/fallen wielders`
          }
          aria-pressed={showGhosted}
        >
          ✦ {ghostedCount}
        </button>
      )}
      <button
        type="button"
        className="hud-action-btn"
        onClick={() =>
          openPanel({ kind: "dispatch", title: "Dispatch", width: 480 })
        }
        title="dispatch a wielder — opens the spawn dialog"
        aria-label="Dispatch a wielder"
      >
        + dispatch
      </button>
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
        <div className="hud-empty">
          {all.length === 0
            ? "The kingdom is quiet. Spawn or run an agent to begin."
            : "All active wielders done. Toggle ✦ to see history."}
        </div>
      ) : (
        <div className="party-list">
          {list.map((u) => (
            <PartyRow key={u.id} unit={u} />
          ))}
        </div>
      )}
    </HudWidget>
  );
}
