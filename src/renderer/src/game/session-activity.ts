import type { UnitState } from "@shared/events";
import type { MonitorAgentState, MonitorSnapshot } from "@shared/schemas";
import { activityForToolName } from "./world-aliveness";
import {
  monitorAgentForUnit,
  useMonitorStore,
} from "../monitoring/monitor-store";

export type SessionActivity = {
  id: string;
  unitId: string;
  worldId: string;
  label: string;
  toolLabel?: string;
  symbol: string;
  color: string;
  state: "working" | "blocked" | "ended" | "attention" | "quiet" | "stale";
  monitorState: MonitorAgentState;
  detail: string;
  lastObservedAt?: number;
  parentSessionId?: string;
};

const PRESENTATION: Record<
  MonitorAgentState,
  Pick<SessionActivity, "state" | "label" | "symbol" | "color">
> = {
  working: {
    state: "working",
    label: "Working",
    symbol: "◆",
    color: "#94ddf5",
  },
  blocked: {
    state: "blocked",
    label: "Blocked",
    symbol: "!",
    color: "#ffd18a",
  },
  ready: { state: "attention", label: "Ready", symbol: "◇", color: "#a3d9cb" },
  idle: { state: "quiet", label: "Idle", symbol: "·", color: "#b0acc7" },
  done: { state: "ended", label: "Done", symbol: "◇", color: "#a3d9cb" },
  failed: {
    state: "attention",
    label: "Failed",
    symbol: "!",
    color: "#ffaaa7",
  },
  unknown: { state: "stale", label: "Unknown", symbol: "?", color: "#b0acc7" },
  offline: { state: "stale", label: "Offline", symbol: "?", color: "#b0acc7" },
};

/** Presentation only. Never infer operational state from unit age or game stats. */
export function sessionActivity(
  unit: UnitState,
  snapshot: MonitorSnapshot = useMonitorStore.getState().snapshot
): SessionActivity {
  const agent = monitorAgentForUnit(unit, snapshot);
  const monitorState = agent?.state ?? "unknown";
  const caveat =
    monitorState === "done" || monitorState === "failed"
      ? " Session state does not establish task success or verified test results."
      : "";
  return {
    id: `session:${unit.id}`,
    unitId: unit.id,
    worldId: unit.worldId,
    parentSessionId: unit.parentSessionId,
    ...PRESENTATION[monitorState],
    toolLabel:
      monitorState === "working" && unit.lastTool
        ? (
            {
              read: "Reading",
              search: "Searching",
              edit: "Editing",
              shell: "Command",
              web: "Research",
              subagent: "Delegating",
              generic: "Working",
            } as Record<string, string>
          )[activityForToolName(unit.lastTool)]
        : undefined,
    monitorState,
    lastObservedAt: agent?.lastObservedAt,
    detail:
      (agent?.stateReason ??
        "No reconciled monitoring evidence is available for this session.") +
      caveat,
  };
}
