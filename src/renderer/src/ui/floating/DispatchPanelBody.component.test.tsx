// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DispatchPanelBody } from "./DispatchPanelBody";
import { usePanels } from "./panel-store";

function installRw() {
  const rw = {
    listWorkspaceRepos: vi.fn(() => Promise.resolve([])),
    spawnAgent: vi.fn(() =>
      Promise.resolve({ unitId: "unit-1", sessionId: "session-1" })
    ),
  };

  Object.defineProperty(window, "rw", {
    configurable: true,
    writable: true,
    value: rw,
  });

  return rw;
}

function renderDispatch() {
  usePanels.setState({
    panels: [
      {
        id: "dispatch",
        kind: "dispatch",
        title: "Dispatch",
        x: 0,
        y: 0,
        width: 420,
        z: 10_001,
      },
    ],
  });

  render(<DispatchPanelBody />);
}

describe("DispatchPanelBody", () => {
  afterEach(() => {
    usePanels.setState(usePanels.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it("discloses Cursor force/trust spawning before dispatch", async () => {
    installRw();
    const user = userEvent.setup();
    renderDispatch();

    expect(screen.queryByText(/--force/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "cursor" }));

    expect(screen.getByText(/--force/i)).toBeVisible();
    expect(screen.getByText(/--trust/i)).toBeVisible();
    expect(screen.getByText(/native UI/i)).toBeVisible();
  });
});
