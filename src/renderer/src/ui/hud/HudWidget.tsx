/**
 * HUD widget shell — translucent corner overlay with a clickable
 * header that toggles collapse. The actual contents (party list,
 * letters, alerts, etc.) are children. Anchor controls which corner
 * the widget locks to. Future "Edit HUD layout" mode will override
 * the anchor with user-chosen positions.
 */
import { useState } from "react";

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
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <section
      className={
        `hud hud-${anchor}` +
        ` hud-tone-${tone}` +
        (collapsed ? " hud-collapsed" : "") +
        (className ? ` ${className}` : "")
      }
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
          <span className="hud-collapse-arrow" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="hud-title">{title}</span>
          {typeof count === "number" && (
            <span className="hud-count">{count}</span>
          )}
        </button>
        {headerExtra && <span className="hud-header-extra">{headerExtra}</span>}
      </header>
      {!collapsed && <div className="hud-body">{children}</div>}
    </section>
  );
}
