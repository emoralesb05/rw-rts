/**
 * Right-edge chat drawer — singleton anchored panel for multi-wielder
 * conversations. Slides in when the first chat tab opens; hides when
 * the last tab closes. Tab bar at top (browser-style: most-recently-
 * opened on the right, per-tab × close). Active tab body =
 * wielder-filtered ConversationStream + chat input.
 *
 * Status dots on each tab:
 *   - red    = wielder has an unresolved permission request
 *   - yellow = unread events since the tab was last active
 *
 * Z-index: above floating wielder panels, BELOW AlertsHUD (so
 * permission letters stay reachable when the drawer is open).
 *
 * Resize: drag the left edge (drawer-resize-handle); width persists
 * to localStorage via the panel-store.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { usePanels } from "./panel-store";
import { useStore } from "../../store";
import { ConversationStream } from "../ConversationStream";
import { WielderChatInput } from "../WielderChatInput";
import { ROLE_HEX } from "../../game/units";
import type { AgentTool, UnitState } from "@shared/events";

const TOOL_GLYPH: Record<AgentTool, string> = {
  claude: "C",
  cursor: "▶",
  codex: "◆",
  gemini: "G",
};

const TOOL_LABEL: Record<AgentTool, string> = {
  claude: "Claude",
  cursor: "Cursor",
  codex: "Codex",
  gemini: "Gemini",
};

type TabStatus = "permission" | "unread" | "none";

/** Compute the per-tab status dot. Permission outranks unread. */
function statusForTab(
  unitId: string,
  events: ReturnType<typeof useStore.getState>["events"],
  letters: ReturnType<typeof useStore.getState>["letters"],
  unit: UnitState | undefined,
  isActive: boolean,
  lastSeenTs: number | undefined
): TabStatus {
  // Permission first.
  const hasPendingPerm = letters.some((l) => {
    if (l.sessionId !== unit?.sessionId) return false;
    return l.actions.some(
      (a) =>
        a.action.kind === "permission-allow" ||
        a.action.kind === "permission-deny" ||
        a.action.kind === "permission-observe"
    );
  });
  if (hasPendingPerm) return "permission";
  // If active, no unread (active = caught up).
  if (isActive) return "none";
  // Unread = any event for this session newer than lastSeen.
  if (!lastSeenTs) return "none";
  const hasNewer = events.some(
    (e) => e.sessionId === unit?.sessionId && e.timestamp > lastSeenTs
  );
  return hasNewer ? "unread" : "none";
}

const MINIMIZED_WIDTH = 48;

export function ChatDrawer() {
  const drawer = usePanels((s) => s.drawer);
  const closeDrawerTab = usePanels((s) => s.closeDrawerTab);
  const setDrawerActiveTab = usePanels((s) => s.setDrawerActiveTab);
  const setDrawerWidth = usePanels((s) => s.setDrawerWidth);
  const focusDrawer = usePanels((s) => s.focusDrawer);
  const closeDrawer = usePanels((s) => s.closeDrawer);
  const toggleDrawerMinimized = usePanels((s) => s.toggleDrawerMinimized);
  const expandDrawer = usePanels((s) => s.expandDrawer);
  const units = useStore((s) => s.units);
  const events = useStore((s) => s.events);
  const letters = useStore((s) => s.letters);

  // Track when each tab was last active so we can compute "unread"
  // dots on inactive tabs. Reset on activation.
  const lastSeenRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (drawer?.activeTab) {
      lastSeenRef.current[drawer.activeTab] = Date.now();
    }
  }, [drawer?.activeTab]);

  // Resize-by-drag on the left edge.
  const dragRef = useRef<{ startX: number; startWidth: number; pointerId: number } | null>(null);
  const onResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !drawer) return;
      dragRef.current = {
        startX: e.clientX,
        startWidth: drawer.width,
        pointerId: e.pointerId,
      };
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [drawer]
  );
  const onResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      // Drawer is right-anchored — dragging the left edge LEFT widens
      // it (negative dx → larger width).
      const dx = e.clientX - drag.startX;
      setDrawerWidth(drag.startWidth - dx);
    },
    [setDrawerWidth]
  );
  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  }, []);

  // Track scroll-to-event ticks per tab so an ActivityLog click can
  // request "scroll to this timestamp" without resetting on every
  // re-render.
  const [scrollState, setScrollState] = useState<{
    tabId: string;
    ts: number;
    tick: number;
  } | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ unitId: string; ts: number }>;
      if (!ce.detail) return;
      setScrollState({
        tabId: ce.detail.unitId,
        ts: ce.detail.ts,
        tick: Date.now(),
      });
    };
    window.addEventListener("kh:drawer-scroll-to", handler as EventListener);
    return () =>
      window.removeEventListener(
        "kh:drawer-scroll-to",
        handler as EventListener
      );
  }, []);

  if (!drawer || !drawer.activeTab) return null;

  const activeUnit = units[drawer.activeTab];
  const minimized = drawer.minimized;
  const renderedWidth = minimized ? MINIMIZED_WIDTH : drawer.width;

  // Minimized layout: thin vertical strip showing one dot per tab
  // (color-coded by status). Click a dot to expand + activate that
  // tab. Click the expand chevron to restore without changing tab.
  if (minimized) {
    return (
      <div
        className="chat-drawer chat-drawer-minimized"
        style={{ width: renderedWidth, zIndex: drawer.z }}
        role="complementary"
        aria-label="Wielder chats (minimized)"
        onPointerDown={() => focusDrawer()}
      >
        <div className="chat-drawer-mini-tabs">
          {drawer.openTabs.map((unitId) => {
            const unit = units[unitId];
            const isActive = drawer.activeTab === unitId;
            // When minimized, the user isn't actually looking at any
            // tab's chat — so even the "active" tab should surface
            // unread/permission dots. Pass isActive: false to the
            // status calc so all tabs show notifications equally.
            const status = statusForTab(
              unitId,
              events,
              letters,
              unit,
              false,
              lastSeenRef.current[unitId]
            );
            const name = unit?.displayName ?? "—";
            return (
              <button
                key={unitId}
                type="button"
                className={
                  "chat-drawer-mini-tab" +
                  (isActive ? " active" : "") +
                  ` status-${status}`
                }
                onClick={() => {
                  setDrawerActiveTab(unitId);
                  expandDrawer();
                }}
                title={name}
                aria-label={`Open ${name} chat`}
                style={unit ? { color: ROLE_HEX[unit.role] } : undefined}
              >
                {/* Tab initial = wielder color tint so they're
                 * distinguishable at a glance. */}
                <span className="chat-drawer-mini-tab-letter">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                {status !== "none" && (
                  <span
                    className={`chat-drawer-tab-dot dot-${status}`}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="chat-drawer-mini-expand"
          onClick={() => expandDrawer()}
          title="Expand chat drawer"
          aria-label="Expand chat drawer"
        >
          {/* Drawer is anchored right; expanding grows it leftward,
           * so the chevron points left. */}
          <ChevronLeft size={16} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      className="chat-drawer"
      style={{ width: renderedWidth, zIndex: drawer.z }}
      role="complementary"
      aria-label="Wielder chats"
      onPointerDown={() => focusDrawer()}
    >
      <div
        className="chat-drawer-resize"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        title="Drag to resize"
        aria-hidden="true"
      />
      <div className="chat-drawer-tabs" role="tablist">
        {drawer.openTabs.map((unitId) => {
          const unit = units[unitId];
          const isActive = drawer.activeTab === unitId;
          const status = statusForTab(
            unitId,
            events,
            letters,
            unit,
            isActive,
            lastSeenRef.current[unitId]
          );
          const name = unit?.displayName ?? "—";
          const tool = unit?.tool;
          return (
            <div
              key={unitId}
              className={
                "chat-drawer-tab" +
                (isActive ? " active" : "") +
                ` status-${status}`
              }
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="chat-drawer-tab-main"
                onClick={() => setDrawerActiveTab(unitId)}
                title={`${name} · ${tool ? TOOL_LABEL[tool] : "—"}`}
              >
                {tool && (
                  <span
                    className={`chat-drawer-tab-tool tool-${tool}`}
                    style={unit ? { color: ROLE_HEX[unit.role] } : undefined}
                  >
                    {TOOL_GLYPH[tool]}
                  </span>
                )}
                <span className="chat-drawer-tab-name">{name}</span>
                {status !== "none" && (
                  <span
                    className={`chat-drawer-tab-dot dot-${status}`}
                    aria-label={
                      status === "permission"
                        ? "permission pending"
                        : "unread"
                    }
                  />
                )}
              </button>
              <button
                type="button"
                className="chat-drawer-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeDrawerTab(unitId);
                }}
                aria-label={`Close ${name} chat`}
                title="Close tab"
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          );
        })}
        <div className="chat-drawer-tools">
          <button
            type="button"
            className="chat-drawer-tool-btn"
            onClick={() => toggleDrawerMinimized()}
            aria-label="Minimize drawer"
            title="Minimize drawer (collapses to a pill on the right)"
          >
            {/* Minimize collapses the drawer rightward into the pill. */}
            <ChevronRight size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="chat-drawer-tool-btn close"
            onClick={() => closeDrawer()}
            aria-label="Close drawer"
            title="Close drawer (clears all tabs)"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
      {activeUnit ? (
        <div className="chat-drawer-body">
          <ConversationStream
            sessionId={activeUnit.id}
            scrollToTs={
              scrollState && scrollState.tabId === activeUnit.id
                ? scrollState.ts
                : undefined
            }
            scrollToTick={
              scrollState && scrollState.tabId === activeUnit.id
                ? scrollState.tick
                : 0
            }
          />
          <WielderChatInput unit={activeUnit} />
        </div>
      ) : (
        <div className="chat-drawer-empty">
          This wielder is no longer active.
        </div>
      )}
    </div>
  );
}
