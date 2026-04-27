import { create } from "zustand";
import type { AgentEvent, UnitState, UnitRole, WorldState } from "@shared/events";
import { ROLE_BY_TOOL_NAME } from "@shared/events";
import { play } from "./audio/sounds";

const ROLE_ORDER: UnitRole[] = ["sora", "riku", "kairi", "donald", "goofy"];

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

function roleFor(tool: AgentEvent["tool"], lastToolName?: string, current?: UnitRole): UnitRole {
  if (tool === "cursor") return "organization";
  if (tool === "codex") return "unversed";
  if (lastToolName && ROLE_BY_TOOL_NAME[lastToolName]) return ROLE_BY_TOOL_NAME[lastToolName];
  return current ?? ROLE_ORDER[0];
}

export const useStore = create<Store>((set) => ({
  events: [],
  eventCount: 0,
  units: {},
  worlds: {},
  selectedUnitId: null,
  activeWorldId: null,

  ingest(event) {
    const id = event.sessionId;
    const worldId = worldIdFromCwd(event.cwd);
    set((state) => {
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
