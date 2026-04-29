/**
 * Top-left HUD: party list. Replaces the wielders section of the
 * old throne side panel. Sorts by spawn time (stable order). Clicking
 * a row opens the wielder panel; the chat icon opens it on Messages.
 */
import { useStore } from "../../store";
import { HudWidget } from "./HudWidget";
import { PartyRow } from "./PartyRow";

/** Focuses the bottom command input — used by the WielderHUD's
 * dispatch shortcut. The CommandInput.tsx renders a single visible
 * <input> we can scroll-into-view + focus. */
function focusSpawnInput() {
  const el = document.querySelector<HTMLInputElement>(".command input");
  if (!el) return;
  el.focus();
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function WielderHUD() {
  const units = useStore((s) => s.units);
  // Stable spawn-time sort — newer wielders append below existing ones.
  const list = Object.values(units).sort(
    (a, b) => (a.spawnedAt ?? a.lastActivity) - (b.spawnedAt ?? b.lastActivity)
  );
  const dispatchBtn = (
    <button
      type="button"
      className="hud-action-btn"
      onClick={focusSpawnInput}
      title="dispatch a wielder — focuses the spawn input"
      aria-label="Dispatch a wielder"
    >
      + dispatch
    </button>
  );
  return (
    <HudWidget
      anchor="top-left"
      title="Wielders"
      count={list.length}
      headerExtra={dispatchBtn}
    >
      {list.length === 0 ? (
        <div className="hud-empty">
          The kingdom is quiet. Spawn or run an agent to begin.
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
