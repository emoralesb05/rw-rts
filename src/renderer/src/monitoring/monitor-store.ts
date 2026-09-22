import { create } from "zustand";
import type {
  AgentMonitorRecord,
  MonitorDelta,
  MonitorSnapshot,
} from "@shared/schemas";
import type { UnitState } from "@shared/events";
import { compareMonitorAgents } from "@shared/monitoring-order";

export const EMPTY_MONITOR_SNAPSHOT: MonitorSnapshot = {
  schemaVersion: 1,
  version: 0,
  generatedAt: 0,
  agents: [],
  attention: [],
  integrations: [],
};
type MonitorView = {
  snapshot: MonitorSnapshot;
  loading: boolean;
  error?: string;
};
/** Read replica only: source authority and freshness remain in main. */
export const useMonitorStore = create<MonitorView>(() => ({
  snapshot: EMPTY_MONITOR_SNAPSHOT,
  loading: true,
}));

export function monitorAgentForUnit(
  unit: Pick<UnitState, "tool" | "sessionId">,
  snapshot: MonitorSnapshot
): AgentMonitorRecord | undefined {
  return snapshot.agents.find(
    (agent) =>
      agent.providerId === unit.tool && agent.nativeSessionId === unit.sessionId
  );
}
export function applyMonitorDelta(
  snapshot: MonitorSnapshot,
  delta: MonitorDelta
): MonitorSnapshot {
  if (delta.version <= snapshot.version) return snapshot;
  const agents = new Map(
    snapshot.agents.map((agent) => [agent.agentId, agent])
  );
  for (const id of delta.removedAgentIds) agents.delete(id);
  for (const agent of delta.upsertedAgents) agents.set(agent.agentId, agent);
  return {
    schemaVersion: 1,
    version: delta.version,
    generatedAt: delta.generatedAt,
    agents: [...agents.values()].sort(compareMonitorAgents),
    attention: delta.attention,
    integrations: delta.integrations,
    history: delta.history ?? snapshot.history,
  };
}
type MonitorBridge = Pick<
  Window["rw"],
  "getMonitorSnapshot" | "onMonitorDelta"
>;
/** One app-lifetime connection shared by React and the canvas. */
export function connectMonitor(bridge: MonitorBridge) {
  let active = true;
  let hydrated = false;
  let pending: Promise<void> | undefined;
  const buffered: MonitorDelta[] = [];
  useMonitorStore.setState({
    snapshot: EMPTY_MONITOR_SNAPSHOT,
    loading: true,
    error: undefined,
  });
  const refresh = (): Promise<void> => {
    if (pending) return pending;
    const priorVersion = useMonitorStore.getState().snapshot.version;
    hydrated = false;
    pending = (async () => {
      try {
        let snapshot = await bridge.getMonitorSnapshot();
        if (!active) return;
        if (snapshot.version < priorVersion)
          throw new Error(
            "Monitor snapshot is older than the current view; retry synchronization."
          );
        for (const delta of buffered.sort((a, b) => a.version - b.version)) {
          if (delta.version <= snapshot.version) continue;
          if (delta.version !== snapshot.version + 1)
            throw new Error("Monitor updates missed; retry synchronization.");
          snapshot = applyMonitorDelta(snapshot, delta);
        }
        buffered.length = 0;
        hydrated = true;
        useMonitorStore.setState({
          snapshot,
          loading: false,
          error: undefined,
        });
      } catch (cause) {
        if (!active) return;
        hydrated = false;
        useMonitorStore.setState({
          snapshot: EMPTY_MONITOR_SNAPSHOT,
          loading: false,
          error: cause instanceof Error ? cause.message : "Monitor unavailable",
        });
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  };
  const unsubscribe = bridge.onMonitorDelta((delta) => {
    if (!active) return;
    const snapshot = useMonitorStore.getState().snapshot;
    if (hydrated && delta.version <= snapshot.version) return;
    if (!hydrated || delta.version !== snapshot.version + 1) {
      hydrated = false;
      if (buffered.length >= 1000) buffered.shift();
      buffered.push(delta);
      useMonitorStore.setState({
        snapshot: EMPTY_MONITOR_SNAPSHOT,
        loading: true,
      });
      void refresh();
      return;
    }
    useMonitorStore.setState({ snapshot: applyMonitorDelta(snapshot, delta) });
  });
  void refresh();
  return {
    refresh,
    stop() {
      active = false;
      unsubscribe();
    },
  };
}
