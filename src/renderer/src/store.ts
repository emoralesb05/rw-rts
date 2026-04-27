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

  ingest(event: AgentEvent): void;
  selectUnit(id: string | null): void;
  selectWorld(id: string | null): void;
};

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
  return {
    events,
    eventCount,
    units: { ...state.units, [id]: unit },
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
}));
