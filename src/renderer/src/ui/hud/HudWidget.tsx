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
import { cn } from "@/lib/cn";

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

  const anchorClass: Record<HudAnchor, string> = {
    "top-left": "left-3 top-[38px]",
    "top-right": "right-3 top-[38px] max-h-[30vh]",
    "bottom-left": "bottom-3 left-3",
    "bottom-right": "bottom-3 right-3 max-h-[30vh]",
    "top-center":
      "left-1/2 top-[38px] w-auto max-w-[calc(100%-720px)] -translate-x-1/2",
  };

  return (
    <section
      className={cn(
        "hud",
        `hud-${anchor}`,
        `hud-tone-${tone}`,
        "absolute z-hud flex max-h-[calc(50vh-24px)] w-[340px] flex-col overflow-hidden",
        "rounded-md border border-accent-alt/20 bg-[#0a1130]/60 font-ui shadow-2xl backdrop-blur-md",
        "transition-[width] duration-base ease-out",
        tone === "alert" && "border-warning/45 shadow-[0_0_0_1px_rgba(255,122,60,0.10),0_16px_40px_rgba(0,0,0,0.45)]",
        tone === "info" && "border-accent/30",
        collapsed && "hud-collapsed max-h-none w-[180px]",
        anchorClass[anchor],
        className
      )}
      style={style}
      onPointerDown={onPointerDown}
      aria-label={title}
    >
      <header
        className={cn(
          "flex min-w-0 items-center gap-1.5 border-b border-white/[0.06] bg-accent-alt/5 px-2.5 py-1.5",
          tone === "alert" && "bg-warning/[0.06]",
          collapsed && "border-b-transparent py-1"
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left font-[inherit] text-inherit"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          <span
            className={cn(
              "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.8px] text-accent-alt",
              tone === "alert" && "text-warning"
            )}
          >
            {title}
          </span>
          {typeof count === "number" && (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
              {count}
            </span>
          )}
        </button>
        {headerExtra && !collapsed && (
          <span className="flex shrink-0 items-center gap-1">{headerExtra}</span>
        )}
        {/* Chevron lives at the far right — past any action chip — so
         * the hierarchy reads title → count → action → toggle. Separate
         * button so headerExtra stays clickable in its own right. */}
        <button
          type="button"
          className="inline-flex shrink-0 cursor-pointer items-center border-0 bg-transparent px-0.5 text-muted hover:text-accent-alt"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </header>
      <div
        className={cn(
          "grid min-h-0 grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity]",
          "duration-base ease-out",
          collapsed && "grid-rows-[0fr] opacity-0"
        )}
        aria-hidden={collapsed}
      >
        <div
          className={cn("min-h-0 overflow-y-auto p-2", collapsed && "p-0")}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
