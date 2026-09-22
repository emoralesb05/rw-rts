import type { AgentMonitorRecord, MonitorAgentState } from "./schemas";

export const MONITOR_STATE_WEIGHT: Record<MonitorAgentState, number> = {
  blocked: 8,
  failed: 7,
  ready: 6,
  working: 5,
  idle: 4,
  unknown: 3,
  offline: 2,
  done: 1,
};

export function compareMonitorAgents(
  a: AgentMonitorRecord,
  b: AgentMonitorRecord
): number {
  return (
    MONITOR_STATE_WEIGHT[b.state] - MONITOR_STATE_WEIGHT[a.state] ||
    b.lastObservedAt - a.lastObservedAt ||
    a.displayName.localeCompare(b.displayName)
  );
}
