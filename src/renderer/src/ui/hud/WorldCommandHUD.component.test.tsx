// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorldCommandHUD } from "./WorldCommandHUD";
import { useStore } from "../../store";
import { usePanels } from "../floating/panel-store";
import { TooltipProvider } from "../components/primitives/Tooltip";
import type { UnitState, WorldState } from "@shared/events";

vi.mock("../../audio/sounds", () => ({
  play: vi.fn(),
}));

function world(overrides: Partial<WorldState> = {}): WorldState {
  return {
    id: "world-1",
    path: "/repo",
    label: "Repo",
    unitIds: ["unit-1"],
    riftling: [],
    alertLevel: "idle",
    glimmer: 100,
    ...overrides,
  };
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
    worldId: "world-1",
    hp: 72,
    mp: 88,
    status: "working",
    lastActivity: 1000,
    spawnedAt: 1000,
    spawnedHere: true,
    lastTool: "Read",
    ...overrides,
  };
}

function renderCommandHUD() {
  const activeWorld = world();
  const activeUnit = unit();
  useStore.setState({
    activeWorldId: activeWorld.id,
    worlds: { [activeWorld.id]: activeWorld },
    units: { [activeUnit.id]: activeUnit },
    letters: [],
    events: [],
  });

  return render(
    <TooltipProvider>
      <WorldCommandHUD />
    </TooltipProvider>
  );
}

describe("WorldCommandHUD", () => {
  afterEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    usePanels.setState(usePanels.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it("keeps world-level commands focused on world actions", () => {
    renderCommandHUD();

    const hud = screen.getByRole("region", { name: /repo world command/i });
    expect(
      within(hud).getByRole("button", { name: /focus/i })
    ).toBeInTheDocument();
    expect(
      within(hud).getByRole("button", { name: /dispatch/i })
    ).toBeInTheDocument();
    expect(
      within(hud).getByRole("button", { name: /seal/i })
    ).toBeInTheDocument();
    expect(within(hud).queryByRole("button", { name: /chat/i })).toBeNull();
    expect(within(hud).queryByRole("button", { name: /decree/i })).toBeNull();
    expect(within(hud).queryByRole("button", { name: /comfort/i })).toBeNull();
    expect(within(hud).queryByRole("button", { name: /recall/i })).toBeNull();
  });

  it("positions the command surface as a world-anchored popover", () => {
    const activeWorld = world();
    const activeUnit = unit();
    useStore.setState({
      activeWorldId: activeWorld.id,
      worldCommandAnchor: {
        worldId: activeWorld.id,
        x: 512,
        y: 520,
        worldX: 120,
        worldY: -80,
        visible: true,
      },
      worlds: { [activeWorld.id]: activeWorld },
      units: { [activeUnit.id]: activeUnit },
      letters: [],
      events: [],
    });

    render(
      <TooltipProvider>
        <WorldCommandHUD />
      </TooltipProvider>
    );

    const hud = screen.getByRole("region", { name: /repo world command/i });
    expect(hud).toHaveAttribute("data-placement", "above");
    expect(hud).toHaveStyle({ left: "152px", top: "282px" });
  });

  it("opens wielder status from mission-line agents", async () => {
    const user = userEvent.setup();
    renderCommandHUD();

    await user.click(
      screen.getByRole("button", { name: /open vaelen .* status/i })
    );

    expect(useStore.getState().selectedUnitId).toBe("unit-1");
    expect(usePanels.getState().panels).toEqual([
      expect.objectContaining({
        id: "wielder:unit-1",
        kind: "wielder",
        key: "unit-1",
        title: "Vaelen · claude",
        width: 560,
      }),
    ]);
  });

  it("disambiguates same-name mission-line agents for assistive tech", () => {
    const activeWorld = world({ unitIds: ["unit-1", "unit-2"] });
    const first = unit({
      id: "unit-1",
      sessionId: "same-1",
      lastTool: "Read",
    });
    const second = unit({
      id: "unit-2",
      sessionId: "same-2",
      lastTool: "Bash",
    });
    useStore.setState({
      activeWorldId: activeWorld.id,
      worlds: { [activeWorld.id]: activeWorld },
      units: { [first.id]: first, [second.id]: second },
      letters: [],
      events: [],
    });

    render(
      <TooltipProvider>
        <WorldCommandHUD />
      </TooltipProvider>
    );

    const hud = screen.getByRole("region", { name: /repo world command/i });
    expect(
      within(hud).getByRole("button", {
        name: /open vaelen claude read same-1 status/i,
      })
    ).toBeInTheDocument();
    expect(
      within(hud).getByRole("button", {
        name: /open vaelen claude bash same-2 status/i,
      })
    ).toBeInTheDocument();
  });
});
