// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DecreeModal } from "./DecreeModal";
import { useStore } from "../store";
import type { AgentEvent, UnitState } from "@shared/events";

vi.mock("../audio/sounds", () => ({
  play: vi.fn(),
}));

function installRw() {
  const rw = {
    sendPrompt: vi.fn(() => Promise.resolve(true)),
    savePersisted: vi.fn(() => Promise.resolve(true)),
    killAgent: vi.fn(() => Promise.resolve(true)),
    resolvePermission: vi.fn(() => Promise.resolve(true)),
    resetPersisted: vi.fn(() =>
      Promise.resolve({
        schemaVersion: 2,
        kingdomFoundedAt: 0,
        totalGlimmerEver: 0,
        standingOrders: [],
        wielders: {},
        worlds: {},
      })
    ),
  };

  Object.defineProperty(window, "rw", {
    configurable: true,
    writable: true,
    value: rw,
  });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });

  return rw;
}

function unit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "unit-1",
    sessionId: "unit-1",
    tool: "claude",
    role: "warden1",
    displayName: "Vaelen",
    cwd: "/repo",
    repoRoot: "/repo",
    worldId: "_repo",
    hp: 100,
    mp: 100,
    status: "idle",
    lastActivity: 1,
    spawnedAt: 1,
    spawnedHere: true,
    ...overrides,
  };
}

function toolUseEvent(input: unknown, timestamp: number): AgentEvent {
  return {
    sessionId: "unit-1",
    tool: "claude",
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp,
    kind: "tool_use",
    payload: { name: "Read", input },
    source: "hook",
  };
}

function renderOpenDecree(overrides: Partial<UnitState> = {}) {
  const activeUnit = unit(overrides);
  useStore.setState({
    decreeUnitId: activeUnit.id,
    units: { [activeUnit.id]: activeUnit },
  });
  return render(<DecreeModal />);
}

describe("DecreeModal", () => {
  afterEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a one-off decree to spawned units and closes", async () => {
    const rw = installRw();
    const user = userEvent.setup();
    renderOpenDecree();

    await user.type(
      screen.getByPlaceholderText(/issue your command/i),
      "run the test suite"
    );
    await user.click(screen.getByRole("button", { name: /issue decree/i }));

    await waitFor(() => {
      expect(rw.sendPrompt).toHaveBeenCalledWith({
        unitId: "unit-1",
        prompt: "[Decree from the King]\n\nrun the test suite",
      });
    });
    expect(useStore.getState().decreeUnitId).toBeNull();
  });

  it("renders recent file suggestions and inserts the picked file", async () => {
    installRw();
    const user = userEvent.setup();
    const activeUnit = unit();
    useStore.setState({
      decreeUnitId: activeUnit.id,
      units: { [activeUnit.id]: activeUnit },
      events: [
        toolUseEvent({ file_path: "src/main/index.ts" }, 2),
        toolUseEvent({ file_path: "src/renderer/src/store.ts" }, 1),
      ],
    });
    render(<DecreeModal />);

    const input = screen.getByPlaceholderText(/issue your command/i);
    await user.type(input, "review @store");

    await user.click(await screen.findByText("src/renderer/src/store.ts"));
    expect(input).toHaveValue("review `src/renderer/src/store.ts` ");
  });

  it("confirms standing orders through the alert dialog", async () => {
    const rw = installRw();
    const user = userEvent.setup();
    renderOpenDecree();

    await user.type(
      screen.getByPlaceholderText(/issue your command/i),
      "keep checking tests"
    );
    await user.click(screen.getByRole("button", { name: "every 1m" }));
    await user.click(
      screen.getByRole("button", { name: /issue standing order/i })
    );

    expect(
      screen.getByRole("alertdialog", {
        name: /issue standing order to vaelen/i,
      })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /issue order/i }));

    expect(rw.sendPrompt).not.toHaveBeenCalled();
    expect(Object.values(useStore.getState().standingOrders)).toEqual([
      expect.objectContaining({
        unitId: "unit-1",
        prompt: "keep checking tests",
        intervalMs: 60_000,
        maxIterations: 24,
        status: "active",
      }),
    ]);
    expect(useStore.getState().decreeUnitId).toBeNull();
  });

  it("prevents sending commands to observed-only units", () => {
    installRw();
    renderOpenDecree({ spawnedHere: false });

    expect(
      screen.getByText(/observed-only — Realmkeeper didn't spawn/i)
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/issue your command/i)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /issue decree/i })
    ).toBeDisabled();
  });
});
