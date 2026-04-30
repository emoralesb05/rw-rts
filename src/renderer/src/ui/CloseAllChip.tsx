/**
 * Floating "✕ N" chip that appears at the top-right of the canvas
 * whenever 1+ floating panels are open. Click to close them all;
 * Cmd/Ctrl+Shift+W keyboard shortcut also bound here for global reach.
 *
 * Replaces the close-all button that lived in the old top toolbar.
 */
import { useEffect } from "react";
import { usePanels } from "./floating/panel-store";

export function CloseAllChip() {
  const closeAll = usePanels((s) => s.closeAll);
  const count = usePanels((s) => s.panels.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        closeAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAll]);

  if (count === 0) return null;
  // Renders as a floating chip below the kingdom-header pill so it
  // doesn't collide with AlertsHUD on the right edge. Only visible
  // when at least one panel is open.
  return (
    <button
      type="button"
      className="close-all-chip"
      onClick={closeAll}
      title="close all panels — ⌘⇧W"
      aria-label="Close all panels"
    >
      ✕ close {count}
    </button>
  );
}
