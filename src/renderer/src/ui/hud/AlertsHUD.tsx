/**
 * Top-right HUD: permission requests + other action-required alerts.
 * Distinct from informational letters (those go to LettersHUD bottom-
 * right). Permission letters get the urgent treatment — orange tone
 * border, prominent placement.
 *
 * Z-index plays the same focus-based stacking game as floating panels
 * and the chat drawer:
 *   - On a NEW permission letter arriving, AlertsHUD bumps z to the
 *     top so the user sees it above whatever was previously focused.
 *   - On click, also bumps z (standard click-to-front).
 *   - Otherwise sits at default z (50) and gets covered by the drawer
 *     or panels the user has surfaced.
 */
import { useEffect, useRef } from "react";
import { useStore } from "../../store";
import { usePanels } from "../floating/panel-store";
import { EmptyState } from "../components/kit/EmptyState";
import { HudWidget } from "./HudWidget";
import { LetterCard, isPermissionLetter } from "./LetterCard";

export function AlertsHUD() {
  const letters = useStore((s) => s.letters);
  const applyLetterAction = useStore((s) => s.applyLetterAction);
  const alerts = letters.filter(isPermissionLetter);
  const alertsZ = usePanels((s) => s.alertsZ);
  const focusAlerts = usePanels((s) => s.focusAlerts);

  // Track the set of alert letter ids we've seen — when a new one
  // appears, bump z to bring AlertsHUD to the top.
  const seenIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(alerts.map((l) => l.id));
    let hasNew = false;
    for (const id of ids) {
      if (!seenIdsRef.current.has(id)) {
        hasNew = true;
        break;
      }
    }
    seenIdsRef.current = ids;
    if (hasNew) focusAlerts();
  }, [alerts, focusAlerts]);

  useEffect(() => {
    if (alerts.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const kind =
        key === "a"
          ? "permission-allow"
          : key === "d"
          ? "permission-deny"
          : key === "enter"
          ? "permission-observe"
          : null;
      if (!kind) return;

      for (const letter of alerts) {
        const action = letter.actions.find((a) => a.action.kind === kind)?.action;
        if (action) {
          e.preventDefault();
          applyLetterAction(letter, action);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [alerts, applyLetterAction]);

  return (
    <HudWidget
      anchor="top-right"
      title="Alerts"
      count={alerts.length}
      tone="alert"
      style={alertsZ != null ? { zIndex: alertsZ } : undefined}
      onPointerDown={() => focusAlerts()}
    >
      {alerts.length === 0 ? (
        <EmptyState className="min-h-0 bg-transparent px-2 py-3">
          no alerts
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto pr-1">
          {alerts.map((l) => (
            <LetterCard key={l.id} letter={l} />
          ))}
        </div>
      )}
    </HudWidget>
  );
}
