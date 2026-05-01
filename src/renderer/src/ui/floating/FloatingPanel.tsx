/**
 * FloatingPanel — generic draggable, non-modal panel.
 *
 * Conventions for keykeeper dialogs:
 *   - No backdrop, no auto-dismiss on outside click. Panels stay open
 *     until you explicitly close them.
 *   - Drag by the header (anywhere except the close button) to move.
 *     Position persists in the panel store while open.
 *   - Click anywhere on the panel body to bring it to the front.
 *   - Multiple panels coexist. Z-index managed by panel-store.
 */
import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { usePanels, type Panel } from "./panel-store";

type Props = {
  panel: Panel;
  children: React.ReactNode;
};

export function FloatingPanel({ panel, children }: Props) {
  const closePanel = usePanels((s) => s.closePanel);
  const focusPanel = usePanels((s) => s.focusPanel);
  const moveTo = usePanels((s) => s.moveTo);
  const dragRef = useRef<{
    pointerStart: { x: number; y: number };
    panelStart: { x: number; y: number };
    pointerId: number;
  } | null>(null);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Don't start a drag from interactive controls in the header.
      const target = e.target as HTMLElement;
      if (target.closest("button, input, select, textarea, a")) return;
      if (e.button !== 0) return;
      focusPanel(panel.id);
      dragRef.current = {
        pointerStart: { x: e.clientX, y: e.clientY },
        panelStart: { x: panel.x, y: panel.y },
        pointerId: e.pointerId,
      };
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [focusPanel, panel.id, panel.x, panel.y]
  );

  const onHeaderPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.pointerStart.x;
      const dy = e.clientY - drag.pointerStart.y;
      // Clamp inside the viewport with a small margin so the header
      // stays grabbable.
      const margin = 24;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const x = Math.max(-panel.width + 80, Math.min(w - 80, drag.panelStart.x + dx));
      const y = Math.max(0, Math.min(h - margin, drag.panelStart.y + dy));
      moveTo(panel.id, x, y);
    },
    [moveTo, panel.id, panel.width]
  );

  const onHeaderPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    },
    []
  );

  // Esc closes only the topmost panel (greatest z) — multiple panels
  // can be open and we only want one dismiss per Esc press.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const all = usePanels.getState().panels;
      if (all.length === 0) return;
      const top = all.reduce((acc, p) => (p.z > acc.z ? p : acc), all[0]);
      if (top.id === panel.id) closePanel(panel.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel, panel.id]);

  return (
    <div
      className={
        "floating-panel" + (panel.height ? " floating-panel-fixed-height" : "")
      }
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
        zIndex: panel.z,
      }}
      onPointerDown={() => focusPanel(panel.id)}
      role="dialog"
      aria-label={panel.title}
    >
      <div
        className="floating-panel-header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <span className="floating-panel-grip" aria-hidden="true">⋮⋮</span>
        <span className="floating-panel-title">{panel.title}</span>
        <button
          type="button"
          className="floating-panel-close"
          onClick={() => closePanel(panel.id)}
          aria-label={`Close ${panel.title}`}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="floating-panel-body">{children}</div>
    </div>
  );
}
