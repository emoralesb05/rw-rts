import { describe, expect, it } from "vitest";
import {
  MonitorDeltaSchema,
  MonitorObservationSchema,
  MonitorSnapshotSchema,
} from "./schemas";

describe("monitoring schemas", () => {
  it("accepts a bounded metadata observation", () => {
    expect(
      MonitorObservationSchema.parse({
        observationId: "event:codex:1",
        observedAt: 100,
        expiresAt: 200,
        offlineAt: 300,
        sourceId: "realmkeeper-events",
        sourceKind: "realmkeeper-event",
        authority: "heuristic",
        confidence: "medium",
        providerId: "codex",
        tool: "codex",
        nativeSessionId: "session-1",
        state: "working",
        stateReason: "Using Read",
      })
    ).toMatchObject({ state: "working", providerId: "codex" });
  });

  it("rejects unknown states and malformed deltas", () => {
    expect(() =>
      MonitorObservationSchema.parse({
        observationId: "bad",
        observedAt: 1,
        sourceId: "source",
        sourceKind: "realmkeeper-event",
        authority: "heuristic",
        confidence: "medium",
        providerId: "codex",
        state: "probably-working",
      })
    ).toThrow();
    expect(() => MonitorDeltaSchema.parse({ version: 1 })).toThrow();
  });

  it("accepts an empty startup snapshot", () => {
    expect(
      MonitorSnapshotSchema.parse({
        schemaVersion: 1,
        version: 0,
        generatedAt: 1,
        agents: [],
        attention: [],
        integrations: [],
      })
    ).toMatchObject({ schemaVersion: 1, agents: [] });
  });
});
