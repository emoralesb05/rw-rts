/**
 * ActivityLog — small bottom-right widget showing one-line summaries
 * of recent agent events across the whole kingdom. Inspired by FF14's
 * chat log: docked, collapsible, scannable.
 *
 * Detail isn't here — clicking a row opens the corresponding wielder's
 * panel where the LOG tab shows full event content.
 */
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { ROLE_HEX } from "../game/units";
import { usePanels } from "./floating/panel-store";
import { summarizeEvent, shortAgo } from "./event-summary";

const VISIBLE = 60;

export function ActivityLog() {
  const events = useStore((s) => s.events);
  const units = useStore((s) => s.units);
  const openPanel = usePanels((s) => s.openPanel);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Shown events: most recent first, capped to VISIBLE so the strip
  // doesn't grow unbounded. The store already keeps a 200-event ring.
  const recent = events.slice(0, VISIBLE);

  // Auto-scroll to top on new events (newest are first in the array,
  // so the top of the list is where new lines appear).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [events.length]);

  return (
    <div
      className={"activity-log" + (collapsed ? " collapsed" : "")}
      role="log"
      aria-label="Activity log"
    >
      <button
        type="button"
        className="activity-log-header"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span className="activity-log-title">activity</span>
        <span className="activity-log-count">{events.length}</span>
        <span className="activity-log-toggle" aria-hidden="true">
          {collapsed ? "▲" : "▼"}
        </span>
      </button>
      {!collapsed && (
        <div className="activity-log-body" ref={scrollRef}>
          {recent.length === 0 ? (
            <div className="activity-log-empty">No activity yet.</div>
          ) : (
            recent.map((ev, i) => {
              const unit = units[ev.sessionId];
              const summary = summarizeEvent(ev);
              const dotColor = unit ? ROLE_HEX[unit.role] : "#444";
              const name = unit?.displayName ?? "—";
              return (
                <button
                  type="button"
                  key={`${ev.sessionId}-${ev.timestamp}-${i}`}
                  className={`activity-log-row tone-${summary.tone}`}
                  onClick={() => {
                    if (!unit) return;
                    openPanel({
                      kind: "wielder",
                      key: unit.id,
                      title: `${unit.displayName} · ${unit.tool}`,
                      width: 460,
                    });
                  }}
                  title={
                    unit
                      ? `${unit.displayName} — click to open wielder`
                      : "session not found"
                  }
                >
                  <span className="activity-log-dot" style={{ background: dotColor }} />
                  <span className="activity-log-name">{name}</span>
                  <span className="activity-log-text">{summary.text}</span>
                  <span className="activity-log-time">{shortAgo(ev.timestamp)}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
