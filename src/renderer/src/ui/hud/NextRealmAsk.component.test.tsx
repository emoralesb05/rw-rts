// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { UnitState, Letter } from "@shared/events";
import { useStore } from "../../store";
import { NextRealmAsk } from "./NextRealmAsk";
import { inspectRealmAgent } from "../inspect-realm-agent";
import { MonitorService } from "../../../../main/monitoring/monitor-service";
import {
  EMPTY_MONITOR_SNAPSHOT,
  useMonitorStore,
} from "../../monitoring/monitor-store";

vi.mock("../inspect-realm-agent", () => ({ inspectRealmAgent: vi.fn() }));
const unit = (id: string): UnitState => ({
  id,
  sessionId: id,
  worldId: "w",
  tool: "codex",
  role: "warden1",
  displayName: id,
  cwd: "/repo",
  hp: 100,
  mp: 100,
  status: "working",
  lastActivity: 0,
  spawnedHere: false,
});
const ask = (id: string): Letter => ({
  id,
  sessionId: id,
  createdAt: 0,
  severity: "critical",
  title: "Ask",
  actions: [
    { label: "Allow", action: { kind: "permission-allow", requestId: id } },
  ],
});

it("cycles only sessions with real unresolved asks, even when stale", () => {
  const monitor = new MonitorService(() => Date.now());
  for (const sessionId of ["a", "b"])
    monitor.ingestAgentEvent({
      sessionId,
      tool: "codex",
      cwd: "/repo",
      timestamp: 0,
      kind: "permission_request",
      payload: {},
      source: "hook",
    });
  useMonitorStore.setState({ snapshot: monitor.getSnapshot() });
  useStore.setState({
    units: { a: unit("a"), b: unit("b"), c: unit("c") },
    letters: [ask("a"), ask("b")],
    selectedUnitId: "a",
  });
  render(<NextRealmAsk />);
  fireEvent.click(screen.getByRole("button", { name: "Next ask · 2" }));
  expect(inspectRealmAgent).toHaveBeenLastCalledWith("b", true);
});

it("disables navigation when no session has an unresolved ask", () => {
  useMonitorStore.setState({ snapshot: EMPTY_MONITOR_SNAPSHOT });
  useStore.setState({
    units: { a: unit("a") },
    letters: [],
    selectedUnitId: null,
  });
  render(<NextRealmAsk />);
  expect(
    screen.getByRole("button", { name: "No pending asks" })
  ).toBeDisabled();
});
