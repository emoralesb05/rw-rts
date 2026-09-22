import { describe, expect, it } from "vitest";
import type { AgentEvent, UnitState } from "@shared/events";
import {
  MonitorService,
  MONITOR_FRESHNESS,
} from "../../../main/monitoring/monitor-service";
import { EMPTY_MONITOR_SNAPSHOT } from "../monitoring/monitor-store";
import { sessionActivity } from "./session-activity";

const unit: UnitState = {
  id: "unit",
  sessionId: "native",
  worldId: "repo",
  tool: "codex",
  role: "warden1",
  displayName: "Agent",
  cwd: "/repo",
  hp: 100,
  mp: 100,
  status: "working",
  lastActivity: 1000,
  lastTool: "apply_patch",
  spawnedHere: false,
};
function event(kind: AgentEvent["kind"], timestamp: number): AgentEvent {
  return {
    sessionId: unit.sessionId,
    tool: unit.tool,
    cwd: unit.cwd,
    timestamp,
    kind,
    payload: { requestId: "activity-test-request" },
    source: "hook",
  };
}
describe("shared Realm/Monitor activity", () => {
  it("does not fabricate state from old unit stats or a missing snapshot", () => {
    for (const status of ["working", "complete", "fallen"] as const) {
      expect(
        sessionActivity({ ...unit, status }, EMPTY_MONITOR_SNAPSHOT)
          .monitorState
      ).toBe("unknown");
    }
  });
  it("tracks main freshness, outage, and recovery without a Realm timer", () => {
    let now = 1000;
    const service = new MonitorService(() => now);
    service.ingestAgentEvent(event("tool_use", now));
    const assertState = (state: string) => {
      const snapshot = service.getSnapshot();
      expect(snapshot.agents[0].state).toBe(state);
      expect(sessionActivity(unit, snapshot).monitorState).toBe(state);
      expect(sessionActivity(unit, snapshot).detail).toContain(
        snapshot.agents[0].stateReason
      );
    };
    assertState("working");
    now += MONITOR_FRESHNESS.eventFreshMs + 1;
    assertState("unknown");
    now += MONITOR_FRESHNESS.eventOfflineMs;
    assertState("offline");
    service.ingestAgentEvent(event("tool_use", now));
    assertState("working");
  });
  it("keeps a blocking request authoritative through age, then resolves it", () => {
    let now = 1000;
    const service = new MonitorService(() => now);
    service.ingestAgentEvent(event("permission_request", now));
    now += MONITOR_FRESHNESS.eventOfflineMs * 2;
    expect(sessionActivity(unit, service.getSnapshot()).state).toBe("blocked");
    service.ingestAgentEvent(event("permission_resolved", now));
    expect(sessionActivity(unit, service.getSnapshot()).state).toBe("working");
    service.ingestAgentEvent(event("session_end", ++now));
    const activity = sessionActivity(unit, service.getSnapshot());
    expect(activity.monitorState).toBe("done");
    expect(activity.detail).toContain("does not establish task success");
  });
  it("deduplicates sources by provider/native identity, never repository or session alone", () => {
    const service = new MonitorService(() => 1000);
    service.ingestAgentEvent(event("tool_use", 1000));
    service.ingestProviderSessions(
      {
        generatedAt: 1000,
        sessions: [
          {
            providerSessionId: "native",
            tool: "codex",
            displayName: "Native",
            cwd: "/repo",
            status: "idle",
            availableActions: [],
          },
        ],
        errors: [],
      },
      ["codex"]
    );
    const snapshot = service.getSnapshot();
    expect(snapshot.agents).toHaveLength(1);
    expect(sessionActivity(unit, snapshot).monitorState).toBe("idle");
    expect(
      sessionActivity({ ...unit, tool: "claude" }, snapshot).monitorState
    ).toBe("unknown");
    expect(
      sessionActivity({ ...unit, sessionId: "another" }, snapshot).monitorState
    ).toBe("unknown");
  });
});
