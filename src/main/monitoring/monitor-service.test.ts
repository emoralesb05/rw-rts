import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@shared/events";
import type { MonitorDelta } from "@shared/schemas";
import { MONITOR_FRESHNESS, MonitorService } from "./monitor-service";

function event(
  kind: AgentEvent["kind"],
  timestamp: number,
  payload: AgentEvent["payload"] = {}
): AgentEvent {
  return {
    sessionId: "session-1",
    tool: "codex",
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp,
    kind,
    payload,
    source: "hook",
  };
}

describe("MonitorService", () => {
  it("makes unresolved input authoritative until it is resolved", () => {
    let now = 1_000;
    const service = new MonitorService(() => now);

    service.ingestAgentEvent(event("tool_use", now, { name: "Bash" }));
    service.ingestAgentEvent(
      event("permission_request", now + 1, { requestId: "permission-1" })
    );

    let agent = service.getSnapshot().agents[0];
    expect(agent).toMatchObject({
      agentId: "codex:session-1",
      state: "blocked",
      authority: "blocking",
      stateReason: "Waiting for permission",
    });
    expect(service.getSnapshot().attention[0]).toMatchObject({
      attentionId: "permission:codex:session-1",
      kind: "permission",
      lifecycle: "open",
    });

    now += 2;
    service.ingestAgentEvent(
      event("permission_resolved", now, { requestId: "permission-1" })
    );
    agent = service.getSnapshot().agents[0];
    expect(agent.state).toBe("working");
    expect(service.getSnapshot().attention).toEqual([]);
  });

  it("clears a pending blocker when its provider session ends", () => {
    let now = 2_000;
    const service = new MonitorService(() => now);
    service.ingestAgentEvent(
      event("user_input_request", now, { requestId: "question-1" })
    );
    expect(service.getSnapshot().agents[0].state).toBe("blocked");

    now += 1;
    service.ingestAgentEvent(event("session_end", now));
    expect(service.getSnapshot().agents[0].state).toBe("done");
    expect(service.getSnapshot().attention).toEqual([]);
  });

  it("lets fresh provider lifecycle evidence beat activity heuristics", () => {
    const now = 10_000;
    const service = new MonitorService(() => now);
    service.ingestAgentEvent(event("tool_use", now, { name: "Read" }));
    service.ingestProviderSessions(
      {
        generatedAt: now + 1,
        sessions: [
          {
            providerSessionId: "session-1",
            tool: "codex",
            displayName: "Review worker",
            cwd: "/repo",
            status: "idle",
            availableActions: ["resume", "fork"],
          },
        ],
        errors: [],
      },
      ["codex"]
    );

    expect(service.getSnapshot().agents[0]).toMatchObject({
      displayName: "Review worker",
      state: "idle",
      authority: "provider",
      confidence: "high",
      sources: ["provider-inventory:codex", "realmkeeper-events"],
    });
  });

  it("turns expired evidence unknown and then offline without inventing idle", () => {
    let now = 5_000;
    const service = new MonitorService(() => now);
    service.ingestAgentEvent(event("tool_use", now, { name: "Edit" }));

    now += MONITOR_FRESHNESS.eventFreshMs + 1;
    expect(service.getSnapshot().agents[0]).toMatchObject({
      state: "unknown",
      confidence: "stale",
    });

    now = 5_000 + MONITOR_FRESHNESS.eventOfflineMs + 1;
    expect(service.getSnapshot().agents[0]).toMatchObject({
      state: "offline",
      confidence: "stale",
    });
  });

  it("publishes versioned deltas and excludes raw event content", () => {
    let now = 20_000;
    const service = new MonitorService(() => now);
    const deltas: MonitorDelta[] = [];
    service.subscribe((delta) => deltas.push(delta));

    service.ingestAgentEvent(
      event("assistant_text", now, {
        text: "SENTINEL_PRIVATE_RESPONSE",
      })
    );

    expect(deltas).toHaveLength(1);
    expect(deltas[0].version).toBeGreaterThan(0);
    expect(deltas[0].upsertedAgents).toHaveLength(1);
    expect(JSON.stringify(deltas[0])).not.toContain(
      "SENTINEL_PRIVATE_RESPONSE"
    );

    now += MONITOR_FRESHNESS.eventFreshMs + 1;
    service.tick();
    expect(deltas.at(-1)?.upsertedAgents[0].state).toBe("unknown");
  });

  it("does not expose provider thread previews as monitor content", () => {
    const service = new MonitorService(() => 30_000);
    const secret = "SENTINEL_PRIVATE_PROVIDER_PROMPT";
    service.ingestProviderSessions(
      {
        generatedAt: 30_000,
        sessions: [
          {
            providerSessionId: "01999999-aaaa-bbbb-cccc-dddddddddddd",
            tool: "codex",
            displayName: secret,
            cwd: "/repo",
            status: "idle",
            preview: secret,
            availableActions: ["resume", "fork"],
          },
        ],
        errors: [],
      },
      ["codex"]
    );

    const serialized = JSON.stringify(service.getSnapshot());
    expect(serialized).not.toContain(secret);
    expect(service.getSnapshot().agents[0]).toMatchObject({
      displayName: "Codex 01999999",
      currentActivity: "Provider reports idle",
    });
  });

  it("renews source freshness when an unchanged revision is polled again", () => {
    let now = 1_000;
    const service = new MonitorService(() => now);
    const observation = {
      observationId: "herdr:w1:p1",
      observedAt: now,
      expiresAt: now + 10_000,
      offlineAt: now + 30_000,
      sourceId: "herdr",
      sourceKind: "herdr" as const,
      authority: "authoritative" as const,
      confidence: "high" as const,
      providerId: "codex",
      state: "working" as const,
      revision: "4:10",
    };
    service.ingestObservation(observation);

    now = 9_000;
    service.ingestObservation({
      ...observation,
      observedAt: now,
      expiresAt: now + 10_000,
      offlineAt: now + 30_000,
    });
    now = 12_000;

    expect(service.getSnapshot().agents[0]).toMatchObject({
      state: "working",
      confidence: "high",
      lastObservedAt: 9_000,
    });
  });
});
