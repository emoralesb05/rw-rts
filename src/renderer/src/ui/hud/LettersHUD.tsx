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
  const informational = letters.filter((l) => !isPermissionLetter(l));
  return (
    <HudWidget
      anchor="bottom-right"
      title="Letters"
      count={informational.length}
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
