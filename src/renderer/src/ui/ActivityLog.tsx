/**
 * ActivityLog — small bottom-left widget showing one-line summaries
 * of recent agent events across the whole kingdom. Inspired by FF14's
 * chat log: docked, collapsible, scannable.
 *
 * Click routing (per design discussion 2026-04-29):
 *   - tool_use / tool_result / assistant_text / user_prompt / error
 *       → open a chat-drawer tab for the wielder, scrolled to event
 *   - permission_request / user_input_request
 *       → highlight the matching alert card in AlertsHUD (top-right);
 *         silent fail if it's already been resolved/dismissed
 *   - session_start / session_end / subagent_spawn / resolved request markers
 *       → not clickable (system markers, no useful drill-through)
 */
import { Fragment, useEffect, useRef } from "react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "../store";
import { ROLE_HEX } from "../game/units";
import { usePanels } from "./floating/panel-store";
import { usePersistedBool } from "./hud/hud-prefs";
import { summarizeEvent, shortAgo } from "./event-summary";
import { TooltipHint } from "./components/kit/TooltipHint";
import { cn } from "@/lib/cn";
import { pulseLetterElement } from "./hud/letter-highlight";
import type { AgentEvent } from "@shared/events";

const VISIBLE = 60;

const NON_CLICKABLE: ReadonlySet<AgentEvent["kind"]> = new Set([
  "session_start",
  "session_end",
  "subagent_spawn",
  "permission_resolved",
  "user_input_resolved",
]);

function toneTextClass(tone: string) {
  switch (tone) {
    case "warn":
      return "text-warning";
    case "danger":
      return "text-danger";
    case "ok":
      return "text-text";
    default:
      return "text-muted";
  }
}

/** Pulse + scroll the AlertsHUD letter card whose permission action
 * carries the given requestId. If AlertsHUD is collapsed, fire an
 * expand event first so the body re-renders, then locate the card on
 * the next frame. Silent fail if no match (the alert has already been
 * resolved or auto-dismissed). */
function highlightAlert(requestId: string) {
  // Force-expand AlertsHUD if it's currently collapsed.
  window.dispatchEvent(
    new CustomEvent("rw:expand-hud", { detail: { title: "Alerts" } })
  );
  const findAndPulse = () => {
    const el = document.querySelector<HTMLElement>(
      `.hud-top-right [data-letter-request-id="${requestId}"]`
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    pulseLetterElement(el);
  };
  // First try synchronously (already-expanded case), then fall back to
  // next animation frame to give the React re-render after expand a
  // chance to mount the body.
  const el = document.querySelector<HTMLElement>(
    `.hud-top-right [data-letter-request-id="${requestId}"]`
  );
  if (el) findAndPulse();
  else requestAnimationFrame(() => requestAnimationFrame(findAndPulse));
}

export function ActivityLog() {
  const events = useStore((s) => s.events);
  const units = useStore((s) => s.units);
  const letters = useStore((s) => s.letters);
  const openDrawerTab = usePanels((s) => s.openDrawerTab);
  const [collapsed, setCollapsed] = usePersistedBool(
    "collapsed:Activity",
    false
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  // Take the newest VISIBLE events (store stores newest-first), then
  // reverse so the oldest of the visible window sits at the top of the
  // strip and the newest lands at the bottom — matches the Messages
  // tab's read order.
  const recent = events.slice(0, VISIBLE).reverse();

  // Set of requestIds that still have a live letter waiting for action.
  // Anything else with kind=permission_request/user_input_request in the
  // activity log is "resolved" — historical, no drill-through.
  const activeRequestIds = new Set<string>();
  for (const l of letters) {
    for (const a of l.actions) {
      if (
        (a.action.kind === "permission-allow" ||
          a.action.kind === "permission-deny" ||
          a.action.kind === "permission-observe" ||
          a.action.kind === "user-input-submit") &&
        a.action.requestId
      ) {
        activeRequestIds.add(a.action.requestId);
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
      className={cn(
        "activity-log z-hud absolute bottom-3 left-3 flex max-h-[280px] w-[360px]",
        "border-accent-alt/20 flex-col overflow-hidden rounded-md border",
        "text-text bg-[#0a1130]/80 font-mono shadow-2xl backdrop-blur-md",
        "duration-base transition-[width] ease-out",
        collapsed && "max-h-8 w-[180px]"
      )}
      role="log"
      aria-label="Activity log"
    >
      <button
        type="button"
        className={cn(
          "border-line flex w-full cursor-pointer items-center gap-2 border-0 border-b",
          "bg-accent-alt/5 text-text px-2.5 py-1.5 text-left font-[inherit]",
          collapsed && "border-b-transparent"
        )}
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span className="text-accent-alt text-[10px] font-bold tracking-[0.8px] uppercase">
          activity
        </span>
        <span className="text-muted text-[10px] tabular-nums">
          {events.length}
        </span>
        <span
          className="text-muted ml-auto inline-flex items-center"
          aria-hidden="true"
        >
          {collapsed ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>
      <div
        className={cn(
          "grid min-h-0 grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity]",
          "duration-base ease-out",
          collapsed && "grid-rows-[0fr] opacity-0"
        )}
        aria-hidden={collapsed}
      >
        <div
          className={cn("min-h-0 overflow-y-auto py-1", collapsed && "p-0")}
          ref={scrollRef}
        >
          {recent.length === 0 ? (
            <div className="font-ui text-muted px-3.5 py-3 text-center text-[11px] italic">
              No activity yet.
            </div>
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
              const isRequestEvent =
                ev.kind === "permission_request" ||
                ev.kind === "user_input_request";
              const isRequestResolved =
                isRequestEvent &&
                !!ev.payload.requestId &&
                !activeRequestIds.has(ev.payload.requestId);
              const clickable =
                !NON_CLICKABLE.has(ev.kind) &&
                !isRequestResolved &&
                (isRequestEvent ? !!ev.payload.requestId : !!unit);
              const tone = isRequestResolved ? "muted" : summary.tone;
              const rowClassName = cn(
                "grid w-full grid-cols-[8px_100px_minmax(0,1fr)_28px] items-center gap-1.5",
                "border-0 border-b border-white/[0.03] bg-transparent px-2.5 py-1",
                "text-left font-[inherit] text-[10.5px] text-inherit",
                clickable
                  ? "cursor-pointer hover:bg-accent-alt/[0.06]"
                  : "cursor-default opacity-60",
                !clickable && "hover:bg-transparent"
              );
              const onClick = () => {
                if (!clickable) return;
                if (isRequestEvent && ev.payload.requestId) {
                  highlightAlert(ev.payload.requestId);
                  return;
                }
                if (!unit) return;
                openDrawerTab(unit.id);
                // Tell the drawer to scroll its conversation stream to
                // this event. Posted next tick so the drawer renders
                // first and the active tab is in place.
                window.setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent("rw:drawer-scroll-to", {
                      detail: { unitId: unit.id, ts: ev.timestamp },
                    })
                  );
                }, 0);
              };
              const titleAttr = !clickable
                ? isRequestResolved
                  ? "request already resolved"
                  : "system event"
                : isRequestEvent
                  ? "click to spotlight the alert"
                  : isMe
                    ? `you sent a prompt to ${recipientName}`
                    : `${recipientName} — click to open conversation`;
              const summaryText = isRequestResolved
                ? `${summary.text} · resolved`
                : summary.text;
              const NameSlot = isMe ? (
                <span className="text-accent-alt overflow-hidden font-semibold text-ellipsis whitespace-nowrap">
                  Me
                  <span className="text-muted mx-1 inline-flex items-center font-normal">
                    <ArrowRight size={10} aria-hidden />
                  </span>
                  <span style={{ color: recipientColor }}>{recipientName}</span>
                </span>
              ) : (
                <span className="text-text overflow-hidden font-semibold text-ellipsis whitespace-nowrap">
                  {recipientName}
                </span>
              );
              const Body = (
                <>
                  <span
                    className="rounded-pill size-1.5"
                    style={{ background: dotColor }}
                  />
                  {NameSlot}
                  <span
                    className={cn(
                      "overflow-hidden text-ellipsis whitespace-nowrap",
                      toneTextClass(tone)
                    )}
                  >
                    {summaryText}
                  </span>
                  <span className="text-muted text-right text-[9.5px] tabular-nums">
                    {shortAgo(ev.timestamp)}
                  </span>
                </>
              );
              const Row = clickable ? (
                <button
                  type="button"
                  className={rowClassName}
                  onClick={onClick}
                >
                  {Body}
                </button>
              ) : (
                <div className={rowClassName} aria-disabled="true">
                  {Body}
                </div>
              );
              return titleAttr ? (
                <TooltipHint key={key} label={titleAttr}>
                  {Row}
                </TooltipHint>
              ) : (
                <Fragment key={key}>{Row}</Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
