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
import { IconButton } from "../../components/kit/IconButton";
import { cn } from "@/lib/cn";

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
      className={cn(
        "fixed flex origin-center flex-col overflow-hidden rounded-lg",
        "border border-accent bg-[linear-gradient(180deg,#0f1635_0%,#0a1130_100%)]",
        "shadow-[0_30px_80px_rgba(0,0,0,0.65),0_8px_24px_rgba(0,0,0,0.50),0_0_0_1px_rgba(255,216,107,0.18)]",
        "animate-[floating-panel-rise_200ms_cubic-bezier(0.2,0.8,0.3,1)]"
      )}
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
        className="flex cursor-grab select-none items-center gap-2 border-b border-line bg-accent-alt/[0.06] px-2 py-1.5 pl-2.5 font-ui active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <span
          className="text-xs tracking-[-1px] text-muted opacity-60"
          aria-hidden="true"
        >
          ⋮⋮
        </span>
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.8px] text-accent-alt">
          {panel.title}
        </span>
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted hover:bg-white/[0.06] hover:text-text"
          onClick={() => closePanel(panel.id)}
          aria-label={`Close ${panel.title}`}
        >
          <X size={14} aria-hidden />
        </IconButton>
      </div>
      <div className="max-h-[calc(100vh-80px)] overflow-y-auto">{children}</div>
    </div>
  );
}
