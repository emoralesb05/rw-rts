/**
 * HUD widget shell — translucent corner overlay with a clickable
 * header that toggles collapse. The actual contents (party list,
 * letters, alerts, etc.) are children. Anchor controls which corner
 * the widget locks to. Future "Edit HUD layout" mode will override
 * the anchor with user-chosen positions.
 */
import { useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { usePersistedBool } from "./hud-prefs";

export type HudAnchor =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center";

type Props = {
  anchor: HudAnchor;
  title: string;
  count?: number;
  /** Right-side header chip — for action affordances like "Dispatch +" */
  headerExtra?: React.ReactNode;
  /** Tone affects the accent border color. */
  tone?: "default" | "alert" | "info";
  /** Default-collapsed widgets render as a small header strip until clicked. */
  defaultCollapsed?: boolean;
  className?: string;
  /** Inline style overrides — used by AlertsHUD to participate in the
   * focus-based z-index stack (jumps to top when a new permission
   * arrives, falls back when other surfaces grab focus). */
  style?: React.CSSProperties;
  /** Pointer-down handler — used for click-to-focus stacking. */
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  children: React.ReactNode;
};

export function HudWidget({
  anchor,
  title,
  count,
  headerExtra,
  tone = "default",
  defaultCollapsed = false,
  className,
  style,
  onPointerDown,
  children,
}: Props) {
  // Persist collapsed state per widget — the title doubles as a stable
  // key since each HUD has a unique one (Wielders, Alerts, Letters, …).
  const [collapsed, setCollapsed] = usePersistedBool(
    `collapsed:${title}`,
    defaultCollapsed
  );
  // Listen for `kh:expand-hud` events that target this widget by title
  // (e.g. ActivityLog → AlertsHUD when a permission row is clicked).
  // Force-expand so the highlighted letter card is actually in the DOM.
  useEffect(() => {
    const onExpand = (e: Event) => {
      const detail = (e as CustomEvent<{ title?: string }>).detail;
      if (detail?.title === title) setCollapsed(false);
    };
    window.addEventListener("kh:expand-hud", onExpand);
    return () => window.removeEventListener("kh:expand-hud", onExpand);
  }, [title, setCollapsed]);
  return (
    <section
      className={
        `hud hud-${anchor}` +
        ` hud-tone-${tone}` +
        (collapsed ? " hud-collapsed" : "") +
        (className ? ` ${className}` : "")
      }
      style={style}
      onPointerDown={onPointerDown}
      aria-label={title}
    >
      <header className="hud-header">
        <button
          type="button"
          className="hud-collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          <span className="hud-title">{title}</span>
          {typeof count === "number" && (
            <span className="hud-count">{count}</span>
          )}
        </button>
        {headerExtra && <span className="hud-header-extra">{headerExtra}</span>}
        {/* Chevron lives at the far right — past any action chip — so
         * the hierarchy reads title → count → action → toggle. Separate
         * button so headerExtra stays clickable in its own right. */}
        <button
          type="button"
          className="hud-collapse-arrow-btn"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </header>
      {/* Body always renders; visibility is driven by a CSS
       * grid-template-rows + opacity transition on the parent
       * .hud-collapsed class. Renders the children at full layout
       * inside the inner div, then the outer grid row collapses
       * to 0fr → smooth animated open/close. */}
      <div className="hud-body-shell" aria-hidden={collapsed}>
        <div className="hud-body">{children}</div>
      </div>
    </section>
  );
}
