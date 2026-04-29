/**
 * ActivityLog — small bottom-left widget showing one-line summaries
 * of recent agent events across the whole kingdom. Inspired by FF14's
 * chat log: docked, collapsible, scannable.
 *
 * Click routing (per design discussion 2026-04-29):
 *   - tool_use / tool_result / assistant_text / user_prompt / error
 *       → open the wielder panel on the Messages tab
 *   - permission_request
 *       → highlight the matching alert card in AlertsHUD (top-right);
 *         silent fail if it's already been resolved/dismissed
 *   - session_start / session_end / subagent_spawn / permission_resolved
 *       → not clickable (system markers, no useful drill-through)
 */
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { ROLE_HEX } from "../game/units";
import { usePanels } from "./floating/panel-store";
import { summarizeEvent, shortAgo } from "./event-summary";
import type { AgentEvent } from "@shared/events";

const VISIBLE = 60;

const NON_CLICKABLE: ReadonlySet<AgentEvent["kind"]> = new Set([
  "session_start",
  "session_end",
  "subagent_spawn",
  "permission_resolved",
]);

/** Pulse + scroll the AlertsHUD letter card whose permission action
 * carries the given requestId. Silent fail if no match (the alert
 * has already been resolved or auto-dismissed). */
function highlightAlert(requestId: string) {
  const el = document.querySelector<HTMLElement>(
    `.hud-top-right [data-letter-request-id="${requestId}"]`
  );
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  el.classList.remove("letter-pulse"); // restart anim if already running
  // Force reflow so the next add re-triggers the keyframes.
  void el.offsetWidth;
  el.classList.add("letter-pulse");
  window.setTimeout(() => el.classList.remove("letter-pulse"), 1600);
}

export function ActivityLog() {
  const events = useStore((s) => s.events);
  const units = useStore((s) => s.units);
  const letters = useStore((s) => s.letters);
  const openPanel = usePanels((s) => s.openPanel);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Take the newest VISIBLE events (store stores newest-first), then
  // reverse so the oldest of the visible window sits at the top of the
  // strip and the newest lands at the bottom — matches the Messages
  // tab's read order.
  const recent = events.slice(0, VISIBLE).reverse();

  // Set of permission requestIds that still have a live letter waiting
  // for action. Anything else with kind=permission_request in the
  // activity log is "resolved" — historical, no drill-through.
  const activePermissionIds = new Set<string>();
  for (const l of letters) {
    for (const a of l.actions) {
      if (
        (a.action.kind === "permission-allow" ||
          a.action.kind === "permission-deny") &&
        a.action.requestId
      ) {
        activePermissionIds.add(a.action.requestId);
      }
    }
  }

  // Pin to the bottom on new events so the latest line is the one
  // you see by default.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
              // user_prompt = the King speaking *into* the wielder's
              // session, not the wielder talking. Show direction so it
              // reads "Me → Ryn" — clear who the message is going to.
              const isMe = ev.kind === "user_prompt";
              const dotColor = isMe
                ? "#ffd86b"
                : unit
                ? ROLE_HEX[unit.role]
                : "#444";
              const recipientName = unit?.displayName ?? "—";
              const recipientColor = unit ? ROLE_HEX[unit.role] : "#888";
              const key = `${ev.sessionId}-${ev.timestamp}-${i}`;
              // permission_request rows demote to non-clickable (and to
              // a neutral tone) once their letter is gone — clicking a
              // historical, already-resolved permission has nowhere
              // useful to land.
              const isPermResolved =
                ev.kind === "permission_request" &&
                !!ev.payload.requestId &&
                !activePermissionIds.has(ev.payload.requestId);
              const clickable =
                !NON_CLICKABLE.has(ev.kind) &&
                !isPermResolved &&
                (ev.kind === "permission_request" ? !!ev.payload.requestId : !!unit);
              const tone = isPermResolved ? "muted" : summary.tone;
              const className = `activity-log-row tone-${tone}` +
                (clickable ? "" : " not-clickable");
              const onClick = () => {
                if (!clickable) return;
                if (ev.kind === "permission_request" && ev.payload.requestId) {
                  highlightAlert(ev.payload.requestId);
                  return;
                }
                if (!unit) return;
                openPanel({
                  kind: "wielder",
                  key: unit.id,
                  title: `${unit.displayName} · ${unit.tool}`,
                  width: 460,
                  data: {
                    initialTab: "messages",
                    tick: Date.now(),
                    scrollToTs: ev.timestamp,
                  },
                });
              };
              const titleAttr = !clickable
                ? isPermResolved
                  ? "permission already resolved"
                  : "system event"
                : ev.kind === "permission_request"
                ? "click to spotlight the alert"
                : isMe
                ? `you sent a prompt to ${recipientName}`
                : `${recipientName} — click to open conversation`;
              const summaryText = isPermResolved
                ? `${summary.text} · resolved`
                : summary.text;
              const NameSlot = isMe ? (
                <span className="activity-log-name activity-log-name-me">
                  Me
                  <span className="activity-log-arrow">→</span>
                  <span style={{ color: recipientColor }}>{recipientName}</span>
                </span>
              ) : (
                <span className="activity-log-name">{recipientName}</span>
              );
              const Body = (
                <>
                  <span className="activity-log-dot" style={{ background: dotColor }} />
                  {NameSlot}
                  <span className="activity-log-text">{summaryText}</span>
                  <span className="activity-log-time">{shortAgo(ev.timestamp)}</span>
                </>
              );
              return clickable ? (
                <button
                  type="button"
                  key={key}
                  className={className}
                  onClick={onClick}
                  title={titleAttr}
                >
                  {Body}
                </button>
              ) : (
                <div
                  key={key}
                  className={className}
                  title={titleAttr}
                  aria-disabled="true"
                >
                  {Body}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
