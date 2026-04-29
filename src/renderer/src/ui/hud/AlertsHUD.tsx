/**
 * Top-right HUD: permission requests + other action-required alerts.
 * Distinct from informational letters (those go to LettersHUD bottom-
 * right). Permission letters get the urgent treatment — orange tone
 * border, prominent placement.
 */
import { useStore } from "../../store";
import { HudWidget } from "./HudWidget";
import { LetterCard, isPermissionLetter } from "./LetterCard";

export function AlertsHUD() {
  const letters = useStore((s) => s.letters);
  const alerts = letters.filter(isPermissionLetter);
  return (
    <HudWidget
      anchor="top-right"
      title="Alerts"
      count={alerts.length}
      tone="alert"
    >
      {alerts.length === 0 ? (
        <div className="hud-empty">no alerts</div>
      ) : (
        <div className="throne-letter-feed">
          {alerts.map((l) => (
            <LetterCard key={l.id} letter={l} />
          ))}
        </div>
      )}
    </HudWidget>
  );
}
