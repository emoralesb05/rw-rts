// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { OrchestrationRun } from "@shared/orchestration";
import {
  hasActiveStandingOrderRunForUnit,
  standingOrderRunViewsForUnit,
} from "./orchestration-runs";

function run(overrides: Partial<OrchestrationRun> = {}): OrchestrationRun {
  return {
    id: "run-1",
    template: "standing-order",
    title: "Keep tests moving",
    status: "running",
    createdAt: 1_000,
    updatedAt: 2_000,
    params: {
      unitId: "unit-1",
      intervalMs: 120_000,
    },
    providerSessions: [],
    traceIds: [],
    permissionRequestIds: [],
    userInputRequestIds: [],
    steps: [
      {
        id: "step-1",
        title: "Iteration 1",
        kind: "standing-order",
        status: "completed",
        attempts: 1,
        createdAt: 1_000,
        updatedAt: 1_500,
      },
      {
        id: "step-2",
        title: "Iteration 2",
        kind: "standing-order",
        status: "failed",
        attempts: 1,
        createdAt: 1_500,
        updatedAt: 2_000,
      },
    ],
    checkpoints: [],
    budget: { maxIterations: 5 },
    events: [],
    ...overrides,
  };
}

describe("orchestration run selectors", () => {
  it("projects active standing-order runs for a unit", () => {
    const runs = {
      "run-1": run(),
      "run-2": run({
        id: "run-2",
        status: "completed",
        updatedAt: 3_000,
      }),
      "run-3": run({
        id: "run-3",
        params: { unitId: "unit-2", intervalMs: 60_000 },
        updatedAt: 4_000,
      }),
    };

    expect(hasActiveStandingOrderRunForUnit(runs, "unit-1")).toBe(true);
    expect(standingOrderRunViewsForUnit(runs, "unit-1")).toEqual([
      expect.objectContaining({
        intervalMs: 120_000,
        iterationsRun: 1,
        maxIterations: 5,
        run: expect.objectContaining({ id: "run-1" }),
      }),
    ]);
  });
});
