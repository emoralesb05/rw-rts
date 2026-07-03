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
import { useStore } from "../../store";

function installRw() {
  const rw = {
    controlSession: vi.fn(() =>
      Promise.resolve({ action: "interrupt", ok: true })
    ),
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

function renderPanel(activeUnit: UnitState) {
  useStore.setState({
    events: [],
    units: { [activeUnit.id]: activeUnit },
    worlds: { [activeUnit.worldId]: world() },
    persisted: EMPTY_PERSISTED,
    standingOrders: {},
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
});
