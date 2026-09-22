import { describe, expect, it, vi } from "vitest";
import type {
  AgentMonitorRecord,
  MonitorDelta,
  MonitorSnapshot,
} from "@shared/schemas";
import {
  connectMonitor,
  EMPTY_MONITOR_SNAPSHOT,
  useMonitorStore,
} from "./monitor-store";

function snapshot(version: number): MonitorSnapshot {
  return { ...EMPTY_MONITOR_SNAPSHOT, version };
}
function agent(id: string): AgentMonitorRecord {
  return {
    agentId: `codex:${id}`,
    providerId: "codex",
    nativeSessionId: id,
    displayName: id,
    state: "working",
    stateReason: "Fixture signal",
    authority: "provider",
    confidence: "high",
    lastObservedAt: 1,
    spawnedHere: false,
    sources: ["fixture"],
    evidence: [],
    controls: [],
    usage: { coverage: "unavailable" },
  };
}
function delta(version: number): MonitorDelta {
  return {
    schemaVersion: 1,
    version,
    generatedAt: version,
    upsertedAgents: [],
    removedAgentIds: [],
    attention: [],
    integrations: [],
  };
}
function harness() {
  let listener: (delta: MonitorDelta) => void = () => {};
  const unsubscribe = vi.fn();
  const getMonitorSnapshot = vi.fn<() => Promise<MonitorSnapshot>>();
  const bridge = {
    getMonitorSnapshot,
    onMonitorDelta: (fn: typeof listener) => {
      listener = fn;
      return unsubscribe;
    },
  };
  return { bridge, emit: (item: MonitorDelta) => listener(item), unsubscribe };
}
describe("shared monitor connection", () => {
  it("buffers updates before hydration without losing existing agents", async () => {
    const h = harness();
    let resolve!: (value: MonitorSnapshot) => void;
    h.bridge.getMonitorSnapshot.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const connection = connectMonitor(h.bridge);
    h.emit({ ...delta(5), upsertedAgents: [agent("new")] });
    expect(useMonitorStore.getState().loading).toBe(true);
    resolve({ ...snapshot(4), agents: [agent("existing")] });
    await connection.refresh();
    expect(useMonitorStore.getState()).toMatchObject({
      loading: false,
      snapshot: { version: 5 },
    });
    expect(h.bridge.getMonitorSnapshot).toHaveBeenCalledTimes(1);
    expect(
      useMonitorStore
        .getState()
        .snapshot.agents.map((item) => item.nativeSessionId)
        .sort()
    ).toEqual(["existing", "new"]);
    connection.stop();
  });
  it("discards duplicates and rehydrates a gap before exposing the new version", async () => {
    const h = harness();
    h.bridge.getMonitorSnapshot
      .mockResolvedValueOnce(snapshot(2))
      .mockResolvedValueOnce(snapshot(5));
    const connection = connectMonitor(h.bridge);
    await connection.refresh();
    h.emit(delta(2));
    expect(useMonitorStore.getState().snapshot.version).toBe(2);
    h.emit(delta(5));
    expect(useMonitorStore.getState().snapshot.agents).toEqual([]);
    await connection.refresh();
    expect(useMonitorStore.getState().snapshot.version).toBe(5);
    connection.stop();
  });
  it("clears uncertain data on failure and recovers on retry", async () => {
    const h = harness();
    h.bridge.getMonitorSnapshot
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce(snapshot(7));
    const connection = connectMonitor(h.bridge);
    await connection.refresh();
    expect(useMonitorStore.getState()).toMatchObject({
      error: "Unavailable",
      snapshot: { version: 0 },
    });
    await connection.refresh();
    expect(useMonitorStore.getState()).toMatchObject({
      error: undefined,
      loading: false,
      snapshot: { version: 7 },
    });
    connection.stop();
  });
  it("cannot overwrite a newer connection after cleanup", async () => {
    const h = harness();
    let resolve!: (value: MonitorSnapshot) => void;
    h.bridge.getMonitorSnapshot.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const old = connectMonitor(h.bridge);
    const oldPending = old.refresh();
    old.stop();
    const next = harness();
    next.bridge.getMonitorSnapshot.mockResolvedValue(snapshot(3));
    const current = connectMonitor(next.bridge);
    await current.refresh();
    resolve(snapshot(99));
    await oldPending;
    h.emit(delta(100));
    expect(useMonitorStore.getState().snapshot.version).toBe(3);
    expect(h.unsubscribe).toHaveBeenCalledOnce();
    current.stop();
  });
  it("does not overwrite deltas received during a manual refresh", async () => {
    const h = harness();
    h.bridge.getMonitorSnapshot.mockResolvedValue(snapshot(2));
    const connection = connectMonitor(h.bridge);
    await connection.refresh();
    let resolve!: (value: MonitorSnapshot) => void;
    h.bridge.getMonitorSnapshot.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const refresh = connection.refresh();
    h.emit(delta(3));
    resolve(snapshot(2));
    await refresh;
    expect(useMonitorStore.getState().snapshot.version).toBe(3);
    connection.stop();
  });
});
