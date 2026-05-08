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
import { AgentToolBadge } from "../AgentToolBadge";
import { EmptyState } from "../components/kit/EmptyState";
import { IconButton } from "../components/kit/IconButton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/primitives/Tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/primitives/Tooltip";
import { cn } from "@/lib/cn";
import type { AgentTool, UnitState } from "@shared/events";

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

function drawerClass(minimized: boolean) {
  return cn(
    "fixed right-0 flex flex-col overflow-hidden font-ui backdrop-blur-md",
    "bg-[rgba(12,18,32,0.96)]",
    "shadow-[-16px_0_40px_rgba(0,0,0,0.5),-1px_0_0_rgba(255,216,107,0.05)]",
    minimized
      ? [
          "bottom-auto right-3 top-[36vh] max-h-[26vh] origin-right",
          "items-stretch gap-1 rounded-lg border border-line p-1.5",
          "animate-[chat-drawer-pill-shrink-in_220ms_cubic-bezier(0.34,1.56,0.64,1)]",
          "bg-[rgba(8,12,22,0.95)]",
          "shadow-[0_12px_28px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,216,107,0.04)]",
        ]
      : [
          "bottom-0 top-8 border-l border-accent-alt/[0.18]",
          "animate-[chat-drawer-slide-in_220ms_cubic-bezier(0.2,0.8,0.3,1)]",
        ]
  );
}

function statusDotClass(status: Exclude<TabStatus, "none">) {
  return cn(
    "size-1.5 shrink-0 rounded-full",
    status === "permission" &&
      "animate-[chat-drawer-pulse_1.6s_ease-in-out_infinite] bg-[#ff5b5b] shadow-[0_0_6px_rgba(255,91,91,0.6)]",
    status === "unread" && "bg-accent-alt"
  );
}

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
        className={drawerClass(true)}
        style={{ width: renderedWidth, zIndex: drawer.z }}
        role="complementary"
        aria-label="Wielder chats (minimized)"
        onPointerDown={() => focusDrawer()}
      >
        <div className="flex min-h-0 flex-1 flex-col items-stretch gap-0.5 overflow-y-auto">
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
              <Tooltip key={unitId}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "relative flex size-8 cursor-pointer items-center justify-center rounded-md border",
                      "border-transparent bg-white/[0.03] font-ui text-[13px] font-bold text-muted transition-colors",
                      "hover:bg-accent-alt/[0.08]",
                      isActive &&
                        "border-accent-alt/45 bg-accent-alt/[0.14]"
                    )}
                    onClick={() => {
                      setDrawerActiveTab(unitId);
                      expandDrawer();
                    }}
                    aria-label={`Open ${name} chat`}
                    style={unit ? { color: ROLE_HEX[unit.role] } : undefined}
                  >
                    {/* Tab initial = wielder color tint so they're
                     * distinguishable at a glance. */}
                    <span>
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    {status !== "none" && (
                      <span
                        className={cn(
                          "absolute right-0.5 top-0.5",
                          statusDotClass(status)
                        )}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{name}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="mt-0.5 inline-flex h-[26px] cursor-pointer items-center justify-center rounded-md border-0 border-t border-line bg-transparent pt-1 text-accent-alt transition-colors hover:bg-accent-alt/[0.08]"
              onClick={() => expandDrawer()}
              aria-label="Expand chat drawer"
            >
              {/* Drawer is anchored right; expanding grows it leftward,
               * so the chevron points left. */}
              <ChevronLeft size={16} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>Expand chat drawer</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className={drawerClass(false)}
      style={{ width: renderedWidth, zIndex: drawer.z }}
      role="complementary"
      aria-label="Wielder chats"
      onPointerDown={() => focusDrawer()}
    >
      <div
        className="absolute bottom-0 left-[-3px] top-0 z-[1] w-2 cursor-ew-resize hover:bg-accent-alt/[0.14]"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        aria-hidden="true"
      />
      {activeUnit ? (
        <Tabs
          value={drawer.activeTab}
          onValueChange={setDrawerActiveTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList
            className="min-h-9 flex-none items-stretch overflow-x-auto border-accent-alt/20 bg-surface-1/95 p-0 [scrollbar-width:thin]"
            aria-label="Wielder chats"
          >
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
                  className={cn(
                    "group relative inline-flex max-w-[220px] flex-none items-stretch border-r border-line bg-transparent transition-colors",
                    "hover:bg-accent-alt/[0.04]",
                    isActive &&
                      "bg-accent-alt/10 after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-accent-alt after:shadow-[0_0_8px_rgba(255,216,107,0.45)]"
                  )}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger
                        value={unitId}
                        className="h-9 min-w-0 flex-none gap-2.5 px-3 py-2 text-[11px] normal-case tracking-[0.4px] data-[state=active]:border-transparent data-[state=active]:text-accent-alt"
                      >
                        {tool && (
                          <AgentToolBadge
                            tool={tool}
                            className="h-5 shrink-0 px-2 text-[8.5px]"
                          />
                        )}
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold">
                          {name}
                        </span>
                        {status !== "none" && (
                          <span
                            className={statusDotClass(status)}
                            aria-label={
                              status === "permission"
                                ? "permission pending"
                                : "unread"
                            }
                          />
                        )}
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      {name} · {tool ? TOOL_LABEL[tool] : "—"}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="my-auto mr-1.5 inline-flex size-[18px] cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted opacity-45 transition-colors transition-opacity hover:bg-[#ff7a7a]/[0.14] hover:text-[#ff7a7a] group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeDrawerTab(unitId);
                        }}
                        aria-label={`Close ${name} chat`}
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Close tab</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
            <div className="ml-auto flex items-stretch border-l border-line">
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="h-auto rounded-none border-0 px-3 text-muted hover:bg-accent-alt/[0.06] hover:text-accent-alt"
                    onClick={() => toggleDrawerMinimized()}
                    aria-label="Minimize drawer"
                  >
                    {/* Minimize collapses the drawer rightward into the pill. */}
                    <ChevronRight size={16} aria-hidden />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>
                  Minimize drawer (collapses to a pill on the right)
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="h-auto rounded-none border-0 px-3 text-muted hover:bg-[#ff7a7a]/[0.08] hover:text-[#ff7a7a]"
                    onClick={() => closeDrawer()}
                    aria-label="Close drawer"
                  >
                    <X size={16} aria-hidden />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>Close drawer (clears all tabs)</TooltipContent>
              </Tooltip>
            </div>
          </TabsList>
          <TabsContent
            value={activeUnit.id}
            className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[rgba(7,12,24,0.42)]"
          >
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
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState className="m-6 min-h-0 bg-transparent text-xs">
          This wielder is no longer active.
        </EmptyState>
      )}
    </div>
  );
}
