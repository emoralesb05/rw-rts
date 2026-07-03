// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WielderPanelBody } from "./WielderPanelBody";
import { usePanels } from "./panel-store";
import { TooltipProvider } from "../components/primitives/Tooltip";
import {
  EMPTY_PERSISTED,
  type UnitState,
  type WorldState,
} from "@shared/events";
import type { OrchestrationRun } from "@shared/orchestration";
import { useStore } from "../../store";

function installRw() {
  const rw = {
    controlSession: vi.fn(() =>
      Promise.resolve({ action: "interrupt", ok: true })
    ),
    controlOrchestrationRun: vi.fn((req: { runId: string }) =>
      Promise.resolve({
        ...orchestrationRun(),
        id: req.runId,
        status: "stopped" as const,
        updatedAt: 3_000,
      })
    ),
    listOrchestrationRuns: vi.fn(() => Promise.resolve([])),
  };

  Object.defineProperty(window, "rw", {
    configurable: true,
    writable: true,
    value: rw,
  });

  return rw;
}

function unit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "unit-1",
    sessionId: "unit-1",
    tool: "codex",
    role: "warden1",
    displayName: "Vaelen",
    cwd: "/repo",
    repoRoot: "/repo",
    worldId: "world-1",
    hp: 100,
    mp: 100,
    status: "working",
    lastActivity: Date.now(),
    spawnedAt: Date.now(),
    spawnedHere: true,
    ...overrides,
  };
}

function world(): WorldState {
  return {
    id: "world-1",
    path: "/repo",
    label: "rw-rts",
    unitIds: ["unit-1"],
    riftling: [],
    alertLevel: "active",
    glimmer: 100,
  };
}

function orchestrationRun(
  overrides: Partial<OrchestrationRun> = {}
): OrchestrationRun {
  return {
    id: "run-1",
    template: "standing-order",
    title: "Keep tests moving",
    status: "running",
    cwd: "/repo",
    repoRoot: "/repo",
    params: {
      unitId: "unit-1",
      intervalMs: 60_000,
    },
    createdAt: 1_000,
    updatedAt: 2_000,
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
        startedAt: 1_000,
        endedAt: 1_500,
      },
    ],
    checkpoints: [],
    budget: { maxIterations: 3 },
    events: [],
    ...overrides,
  };
}

function renderPanel(activeUnit: UnitState, runs: OrchestrationRun[] = []) {
  useStore.setState({
    events: [],
    units: { [activeUnit.id]: activeUnit },
    worlds: { [activeUnit.worldId]: world() },
    persisted: EMPTY_PERSISTED,
    standingOrders: {},
    orchestrationRuns: Object.fromEntries(runs.map((run) => [run.id, run])),
  });
  render(
    <TooltipProvider>
      <WielderPanelBody unitId={activeUnit.id} />
    </TooltipProvider>
  );
}

describe("WielderPanelBody", () => {
  afterEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    usePanels.setState(usePanels.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it("interrupts Codex-owned active turns through session control", async () => {
    const rw = installRw();
    const user = userEvent.setup();
    renderPanel(unit());

    const halt = screen.getByRole("button", { name: /halt/i });
    expect(halt).toBeEnabled();

    await user.click(halt);

    expect(rw.controlSession).toHaveBeenCalledWith({
      action: "interrupt",
      unitId: "unit-1",
      sessionId: "unit-1",
      tool: "codex",
      cwd: "/repo",
      status: "working",
    });
  });

  it("shows interrupt as disabled when the provider cannot halt the turn", () => {
    const rw = installRw();
    renderPanel(unit({ tool: "claude", status: "working" }));

    expect(screen.getByRole("button", { name: /halt/i })).toBeDisabled();
    expect(rw.controlSession).not.toHaveBeenCalled();
  });

  it("shows interrupt as disabled when Codex has no active turn", () => {
    installRw();
    renderPanel(unit({ status: "idle" }));

    expect(screen.getByRole("button", { name: /halt/i })).toBeDisabled();
  });

  it("shows durable standing orders and stops them from the panel", async () => {
    const rw = installRw();
    const user = userEvent.setup();
    renderPanel(unit({ status: "idle" }), [orchestrationRun()]);

    expect(screen.getByText(/1m · 1\/3 · halt/i)).toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: /halt standing order keep tests moving/i,
      })
    );

    expect(rw.controlOrchestrationRun).toHaveBeenCalledWith({
      runId: "run-1",
      action: "stop",
      reason: "Stopped from Wielder panel.",
    });
    expect(useStore.getState().orchestrationRuns["run-1"]).toEqual(
      expect.objectContaining({ status: "stopped" })
    );
  });
});
