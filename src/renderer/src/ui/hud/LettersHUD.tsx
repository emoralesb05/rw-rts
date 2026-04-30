/**
 * Bottom-right HUD: informational letters — sealed keyholes, drive
 * form transitions, finished sessions, stuck-loop hints. Permission
 * letters are filtered OUT (they live in AlertsHUD top-right).
 */
import { useStore } from "../../store";
import { HudWidget } from "./HudWidget";
import { LetterCard, isPermissionLetter } from "./LetterCard";

export function LettersHUD() {
  const letters = useStore((s) => s.letters);
  const dismissInformationalLetters = useStore(
    (s) => s.dismissInformationalLetters
  );
  const informational = letters.filter((l) => !isPermissionLetter(l));
  const clearBtn =
    informational.length > 0 ? (
      <button
        type="button"
        className="hud-action-btn hud-action-btn-ghost"
        onClick={dismissInformationalLetters}
        title="Dismiss every letter — permission alerts are kept"
      >
        ✕ clear
      </button>
    ) : null;
  return (
    <HudWidget
      anchor="bottom-right"
      title="Letters"
      count={informational.length}
      headerExtra={clearBtn}
    >
      {informational.length === 0 ? (
        <div className="hud-empty">no letters</div>
      ) : (
        <div className="throne-letter-feed">
          {informational.map((l) => (
            <LetterCard key={l.id} letter={l} />
          ))}
        </div>
      )}
    </HudWidget>
  );
}
