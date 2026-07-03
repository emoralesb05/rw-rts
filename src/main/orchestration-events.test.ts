import { describe, expect, it } from "vitest";
import type {
  OrchestrationRun,
  OrchestrationRunEvent,
} from "@shared/orchestration";
import { agentEventForOrchestrationRun } from "./orchestration-events";

function run(overrides: Partial<OrchestrationRun> = {}): OrchestrationRun {
  return {
    id: "run-1",
    template: "standing-order",
    title: "Keep tests moving",
    status: "running",
    cwd: "/repo",
    repoRoot: "/repo",
    params: {
      sessionId: "unit-1",
      tool: "codex",
      cwd: "/repo",
    },
    createdAt: 1_000,
    updatedAt: 1_000,
    providerSessions: [],
    traceIds: [],
    permissionRequestIds: [],
    userInputRequestIds: [],
    steps: [],
    checkpoints: [],
    budget: {},
    events: [],
    ...overrides,
  };
}

function orchestrationEvent(
  overrides: Partial<OrchestrationRunEvent> = {}
): OrchestrationRunEvent {
  return {
    id: "event-1",
    kind: "checkpoint",
    at: 1_200,
    message: "Iteration sent",
    stepId: "step-1",
    checkpointId: "checkpoint-1",
    ...overrides,
  };
}

describe("agentEventForOrchestrationRun", () => {
  it("maps durable run events onto AgentEvent envelopes", () => {
    expect(
      agentEventForOrchestrationRun(run(), orchestrationEvent())
    ).toMatchObject({
      sessionId: "unit-1",
      tool: "codex",
      cwd: "/repo",
      repoRoot: "/repo",
      timestamp: 1_200,
      kind: "orchestration_event",
      source: "realmkeeper",
      payload: {
        orchestrationRunId: "run-1",
        orchestrationRunTitle: "Keep tests moving",
        orchestrationRunStatus: "running",
        orchestrationTemplate: "standing-order",
        orchestrationEventKind: "checkpoint",
        text: "Iteration sent",
        stepId: "step-1",
        checkpointId: "checkpoint-1",
      },
    });
  });

  it("skips runs without provider session context", () => {
    expect(
      agentEventForOrchestrationRun(
        run({ cwd: undefined, params: {}, providerSessions: [] }),
        orchestrationEvent()
      )
    ).toBeNull();
  });
});
