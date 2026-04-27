import { create } from "zustand";
import type { AgentEvent, UnitState, UnitRole, WorldState } from "@shared/events";
import { ROLE_BY_TOOL, ROLE_FALLBACK } from "@shared/events";
import { play } from "./audio/sounds";


type Store = {
  events: AgentEvent[];
  eventCount: number;
  units: Record<string, UnitState>;
  worlds: Record<string, WorldState>;
  selectedUnitId: string | null;
  activeWorldId: string | null;
  mutedSessionIds: Record<string, true>;

  ingest(event: AgentEvent): void;
  selectUnit(id: string | null): void;
  selectWorld(id: string | null): void;
  toggleMute(sessionId: string): void;
};

const MUTED_KEY = "kh-rts:muted-sessions";
function loadMuted(): Record<string, true> {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    if (!raw) return {};
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return {};
    const out: Record<string, true> = {};
    for (const id of arr) if (typeof id === "string") out[id] = true;
    return out;
  } catch {
    return {};
  }
}
function saveMuted(m: Record<string, true>) {
  try {
    localStorage.setItem(MUTED_KEY, JSON.stringify(Object.keys(m)));
  } catch {
    // ignore
  }
}

const MAX_EVENTS = 500;

function worldIdFromCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]+/g, "_") || "root";
}

function worldLabel(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] || cwd;
}

function roleFor(
  tool: AgentEvent["tool"],
  lastToolName?: string,
  current?: UnitRole
): UnitRole {
  if (lastToolName) {
    const map = ROLE_BY_TOOL[tool];
    const matched = map?.[lastToolName];
    if (matched) return matched;
  }
  return current ?? ROLE_FALLBACK[tool];
}

// Batch incoming events into one store update per animation frame so
// bursts (e.g. Cursor turn emits 20 tool_use events in <100ms) don't
// trigger 20 separate re-renders.
const _queue: AgentEvent[] = [];
let _flushScheduled = false;

// Pending Task/Agent calls — when a parent fires this and a new session
// starts within PARENT_LINK_WINDOW_MS in the same cwd, treat the new unit
// as the parent's child.
type PendingTask = { parentSessionId: string; cwd: string; time: number };
const _pendingTasks: PendingTask[] = [];
const PARENT_LINK_WINDOW_MS = 8000;
const TASK_NAMES = new Set(["Task", "Agent", "task_v2", "task"]);

function applyOneEvent(state: Store, event: AgentEvent): Partial<Store> {
  const id = event.sessionId;
  const worldId = worldIdFromCwd(event.cwd);
  const events = [event, ...state.events].slice(0, MAX_EVENTS);
  const eventCount = state.eventCount + 1;
  const existing = state.units[id];
  const lastToolName =
    event.kind === "tool_use" ? (event.payload.name as string | undefined) : existing?.lastTool;
  const role = roleFor(event.tool, lastToolName, existing?.role);
  const unit: UnitState = existing
    ? { ...existing }
    : {
        id,
        sessionId: id,
        tool: event.tool,
        role,
        cwd: event.cwd,
        worldId,
        hp: 100,
        mp: 100,
        status: "idle",
        lastActivity: event.timestamp,
        spawnedHere: false,
      };
  if (event.kind === "session_start" && event.source === "spawned") {
    unit.spawnedHere = true;
  }
  // Subagent linkage: an explicit parentSessionId on the event wins;
  // otherwise on session_start, look for a recently-fired Task in this cwd.
  const explicitParent = event.payload.parentSessionId as string | undefined;
  if (explicitParent && !unit.parentSessionId) {
    unit.parentSessionId = explicitParent;
  } else if (event.kind === "session_start" && !unit.parentSessionId) {
    const now = event.timestamp;
    while (
      _pendingTasks.length > 0 &&
      now - _pendingTasks[0].time > PARENT_LINK_WINDOW_MS
    ) {
      _pendingTasks.shift();
    }
    const match = _pendingTasks.find(
      (p) => p.cwd === event.cwd && p.parentSessionId !== id
    );
    if (match) unit.parentSessionId = match.parentSessionId;
  }
  // Record pending Task call so the next session_start in this cwd can link.
  if (
    event.kind === "tool_use" &&
    typeof event.payload.name === "string" &&
    TASK_NAMES.has(event.payload.name)
  ) {
    _pendingTasks.push({
      parentSessionId: id,
      cwd: event.cwd,
      time: event.timestamp,
    });
  }
  unit.role = role;
  unit.lastActivity = event.timestamp;
  unit.lastTool = lastToolName;
  unit.cwd = event.cwd;
  unit.worldId = worldId;
  switch (event.kind) {
    case "session_start":
      unit.status = "idle";
      unit.hp = 100;
      unit.mp = 100;
      break;
    case "session_end":
      unit.status = unit.hp <= 0 ? "fallen" : "complete";
      break;
    case "subagent_spawn":
      // Hook bridge maps Claude's SubagentStop here. Promote the parent
      // (this unit) to Mickey — the king summoning his court back.
      if (unit.tool === "claude") unit.role = "mickey";
      break;
    case "tool_use":
      unit.status = event.payload.name === "Bash" ? "casting" : "working";
      unit.mp = Math.max(0, unit.mp - 4);
      break;
    case "tool_result":
      unit.status = "idle";
      break;
    case "error":
      unit.hp = Math.max(0, unit.hp - 12);
      if (unit.hp <= 0) unit.status = "fallen";
      break;
    case "user_prompt":
      unit.status = "working";
      break;
  }
  const worlds = { ...state.worlds };
  const existingWorld = worlds[worldId];
  const unitIds = existingWorld
    ? Array.from(new Set([...existingWorld.unitIds, id]))
    : [id];
  worlds[worldId] = {
    id: worldId,
    path: event.cwd,
    label: worldLabel(event.cwd),
    unitIds,
  };
  // If a subagent (this unit has a parent) just ended, promote the parent
  // to Mickey to mark "court returned to the king".
  const extraUnits: Record<string, UnitState> = {};
  if (
    event.kind === "session_end" &&
    unit.parentSessionId &&
    unit.tool === "claude"
  ) {
    const parent = state.units[unit.parentSessionId];
    if (parent && parent.role !== "mickey") {
      extraUnits[unit.parentSessionId] = { ...parent, role: "mickey" };
    }
  }

  return {
    events,
    eventCount,
    units: { ...state.units, [id]: unit, ...extraUnits },
    worlds,
  };
}

export const useStore = create<Store>((set) => ({
  events: [],
  eventCount: 0,
  units: {},
  worlds: {},
  selectedUnitId: null,
  activeWorldId: null,
  mutedSessionIds: loadMuted(),

  ingest(event) {
    _queue.push(event);
    if (_flushScheduled) return;
    _flushScheduled = true;
    requestAnimationFrame(() => {
      _flushScheduled = false;
      const batch = _queue.splice(0);
      set((state) => {
        let next: Store = state;
        for (const ev of batch) {
          const delta = applyOneEvent(next, ev);
          next = { ...next, ...delta };
        }
        return next;
      });
    });
  },

  selectUnit(id) {
    if (id) play("select");
    set({ selectedUnitId: id });
  },
  selectWorld(id) {
    set({ activeWorldId: id });
  },
  toggleMute(sessionId) {
    set((state) => {
      const next = { ...state.mutedSessionIds };
      if (next[sessionId]) delete next[sessionId];
      else next[sessionId] = true;
      saveMuted(next);
      return { mutedSessionIds: next };
    });
  },
}));
