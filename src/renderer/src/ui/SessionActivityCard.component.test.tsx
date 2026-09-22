// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { UnitState } from "@shared/events";
import { useStore } from "../store";
import { usePanels } from "./floating/panel-store";
import { SessionActivityCard } from "./SessionActivityCard";
import { useMonitorStore } from "../monitoring/monitor-store";
import { MonitorService } from "../../../main/monitoring/monitor-service";

function service(kind: "tool_use" | "permission_request") {
  const monitor = new MonitorService(() => Date.now());
  monitor.ingestAgentEvent({
    sessionId: "u",
    tool: "codex",
    cwd: "/repo",
    timestamp: Date.now(),
    kind,
    payload: {},
    source: "hook",
  });
  useMonitorStore.setState({ snapshot: monitor.getSnapshot() });
  return monitor;
}

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

it("updates activity from main freshness without another provider event", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  useStore.setState({ letters: [], units: { u: unit } });
  const monitor = service("tool_use");
  const view = render(<SessionActivityCard unit={unit} />);
  expect(screen.getByText(/Working/)).toBeVisible();
  expect(screen.getByText(/No explicitly linked run/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Focus agent in Realm/ }));
  expect(useStore.getState().selectedUnitId).toBe("u");
  act(() => {
    vi.advanceTimersByTime(31000);
    useMonitorStore.setState({ snapshot: monitor.getSnapshot() });
  });
  expect(screen.getByText(/Unknown/)).toBeVisible();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("routes a blocking ask to existing alerts without issuing a control", () => {
  service("permission_request");
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
