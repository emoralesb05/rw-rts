import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitorDelta, MonitorSnapshot } from "@shared/schemas";
import { compareMonitorAgents } from "@shared/monitoring-order";

const EMPTY_SNAPSHOT: MonitorSnapshot = {
  schemaVersion: 1,
  version: 0,
  generatedAt: 0,
  agents: [],
  attention: [],
  integrations: [],
};

export function applyMonitorDelta(
  snapshot: MonitorSnapshot,
  delta: MonitorDelta
): MonitorSnapshot {
  if (delta.version <= snapshot.version) return snapshot;
  const agents = new Map(
    snapshot.agents.map((agent) => [agent.agentId, agent])
  );
  for (const agentId of delta.removedAgentIds) agents.delete(agentId);
  for (const agent of delta.upsertedAgents) agents.set(agent.agentId, agent);
  return {
    schemaVersion: 1,
    version: delta.version,
    generatedAt: delta.generatedAt,
    agents: [...agents.values()].sort(compareMonitorAgents),
    attention: delta.attention,
    integrations: delta.integrations,
  };
}

export function useMonitorSnapshot() {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const versionRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const next = await window.rw.getMonitorSnapshot();
      versionRef.current = Math.max(versionRef.current, next.version);
      setSnapshot((current) =>
        next.version >= current.version ? next : current
      );
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Monitor unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = window.rw.onMonitorDelta((delta) => {
      if (versionRef.current > 0 && delta.version > versionRef.current + 1) {
        void refresh();
      }
      versionRef.current = Math.max(versionRef.current, delta.version);
      setSnapshot((current) => applyMonitorDelta(current, delta));
    });
    void refresh();
    return unsubscribe;
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}
