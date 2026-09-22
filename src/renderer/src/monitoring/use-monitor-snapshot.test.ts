import { describe, expect, it } from "vitest";
import type { MonitorDelta, MonitorSnapshot } from "@shared/schemas";
import { applyMonitorDelta } from "./use-monitor-snapshot";

const snapshot: MonitorSnapshot = {
  schemaVersion: 1,
  version: 2,
  generatedAt: 2,
  agents: [],
  attention: [],
  integrations: [],
};

describe("applyMonitorDelta", () => {
  it("ignores duplicate or out-of-order monitor versions", () => {
    const delta: MonitorDelta = {
      schemaVersion: 1,
      version: 2,
      generatedAt: 3,
      upsertedAgents: [],
      removedAgentIds: [],
      attention: [],
      integrations: [],
    };
    expect(applyMonitorDelta(snapshot, delta)).toBe(snapshot);
  });

  it("keeps a newly blocked agent above working agents", () => {
    const agent = (agentId: string, state: "working" | "blocked") => ({
      agentId,
      providerId: "codex",
      tool: "codex" as const,
      nativeSessionId: agentId,
      displayName: agentId,
      state,
      stateReason: state,
      authority:
        state === "blocked" ? ("blocking" as const) : ("heuristic" as const),
      confidence: "high" as const,
      lastObservedAt: state === "blocked" ? 3 : 2,
      spawnedHere: false,
      sources: ["realmkeeper-events"],
      evidence: [],
      controls: [],
      usage: { coverage: "unavailable" as const },
    });
    const current = { ...snapshot, agents: [agent("working", "working")] };
    const next = applyMonitorDelta(current, {
      schemaVersion: 1,
      version: 3,
      generatedAt: 3,
      upsertedAgents: [agent("blocked", "blocked")],
      removedAgentIds: [],
      attention: [],
      integrations: [],
    });

    expect(next.agents.map((entry) => entry.agentId)).toEqual([
      "blocked",
      "working",
    ]);
  });
});
