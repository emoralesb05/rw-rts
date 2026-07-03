// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { attachStandingOrderMigrator } from "./standing-orders";
import { useStore } from "./store";
import type { UnitState } from "@shared/events";
import type { StandingOrder } from "./store-domain/standing-orders";

function unit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "unit-1",
    sessionId: "session-1",
    tool: "claude",
    role: "warden1",
    displayName: "Vaelen",
    cwd: "/repo",
    repoRoot: "/repo",
    worldId: "world-1",
    hp: 100,
    mp: 100,
    status: "idle",
    lastActivity: 1,
    spawnedHere: true,
    ...overrides,
  };
}

function order(overrides: Partial<StandingOrder> = {}): StandingOrder {
  return {
    id: "legacy-1",
    unitId: "unit-1",
    unitIdentity: "claude::/repo",
    prompt: "keep testing",
    intervalMs: 60_000,
    maxIterations: 5,
    iterationsRun: 2,
    failuresInRow: 0,
    status: "active",
    startedAt: 1_000,
    lastFiredAt: 0,
    ...overrides,
  };
}

function installRw() {
  const rw = {
    createOrchestrationRun: vi.fn((req) =>
      Promise.resolve({
        id: "run-1",
        title: req.title,
        template: req.template,
        status: req.status,
        createdAt: 2_000,
        updatedAt: 2_000,
        providerSessions: [],
        traceIds: [],
        permissionRequestIds: [],
        userInputRequestIds: [],
        steps: [],
        checkpoints: [],
        budget: req.budget,
        params: req.params,
        events: [],
      })
    ),
    savePersisted: vi.fn(() => Promise.resolve()),
  };
  Object.defineProperty(window, "rw", {
    configurable: true,
    writable: true,
    value: rw,
  });
  return rw;
}

describe("standing order migrator", () => {
  afterEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it("migrates bound legacy orders into durable orchestration runs", async () => {
    const rw = installRw();
    useStore.setState({
      units: { "unit-1": unit() },
      standingOrders: { "legacy-1": order() },
      persisted: {
        ...useStore.getInitialState().persisted,
        standingOrders: [
          {
            id: "legacy-1",
            unitIdentity: "claude::/repo",
            prompt: "keep testing",
            intervalMs: 60_000,
            maxIterations: 5,
            iterationsRun: 2,
            startedAt: 1_000,
          },
        ],
      },
    });

    const detach = attachStandingOrderMigrator();

    await waitFor(() => {
      expect(rw.createOrchestrationRun).toHaveBeenCalledTimes(1);
    });
    expect(rw.createOrchestrationRun).toHaveBeenCalledWith({
      template: "standing-order",
      title: "Standing Order · Vaelen",
      status: "running",
      cwd: "/repo",
      repoRoot: "/repo",
      params: {
        unitId: "unit-1",
        sessionId: "session-1",
        tool: "claude",
        cwd: "/repo",
        status: "idle",
        prompt: "keep testing",
        intervalMs: 60_000,
        migratedStandingOrderId: "legacy-1",
      },
      budget: {
        maxIterations: 3,
        maxConsecutiveFailures: 3,
      },
    });
    expect(useStore.getState().orchestrationRuns["run-1"]).toMatchObject({
      id: "run-1",
      template: "standing-order",
    });
    expect(useStore.getState().standingOrders["legacy-1"]).toMatchObject({
      status: "halted",
    });
    expect(rw.savePersisted).toHaveBeenCalledWith(
      expect.objectContaining({ standingOrders: [] })
    );

    detach();
  });

  it("waits for hydrated legacy orders to bind to a unit", async () => {
    const rw = installRw();
    useStore.setState({
      standingOrders: { "legacy-1": order({ unitId: "" }) },
    });

    const detach = attachStandingOrderMigrator();

    await Promise.resolve();
    expect(rw.createOrchestrationRun).not.toHaveBeenCalled();

    detach();
  });
});
