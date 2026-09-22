// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { UnitState } from "@shared/events";
import { useStore } from "../store";
import { usePanels } from "./floating/panel-store";
import { SessionActivityCard } from "./SessionActivityCard";

const unit: UnitState = {
  id: "u",
  sessionId: "u",
  worldId: "w",
  tool: "codex",
  role: "warden1",
  displayName: "Agent",
  cwd: "/repo",
  hp: 100,
  mp: 100,
  status: "working",
  lastActivity: 1000,
  spawnedHere: false,
  lastTool: "Read",
};
afterEach(() => vi.useRealTimers());

it("expires the displayed activity without receiving another event", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  useStore.setState({ letters: [], units: { u: unit } });
  const view = render(<SessionActivityCard unit={unit} />);
  expect(screen.getByText(/Reading/)).toBeVisible();
  expect(screen.getByText(/No explicitly linked run/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Focus agent in Realm/ }));
  expect(useStore.getState().selectedUnitId).toBe("u");
  act(() => vi.advanceTimersByTime(121000));
  expect(screen.getByText(/Stale/)).toBeVisible();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("routes a blocking ask to existing alerts without issuing a control", () => {
  const focusAlerts = vi.fn();
  const original = usePanels.getState().focusAlerts;
  usePanels.setState({ focusAlerts });
  useStore.setState({
    units: { u: unit },
    letters: [
      {
        id: "ask",
        sessionId: "u",
        createdAt: 1000,
        severity: "critical",
        title: "Ask",
        actions: [
          {
            label: "Allow",
            action: { kind: "permission-allow", requestId: "r" },
          },
        ],
      },
    ],
  });
  try {
    render(<SessionActivityCard unit={unit} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review blocking ask" })
    );
    expect(focusAlerts).toHaveBeenCalledOnce();
  } finally {
    usePanels.setState({ focusAlerts: original });
  }
});
