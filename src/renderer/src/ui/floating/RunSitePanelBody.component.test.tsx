// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { OrchestrationRun } from "@shared/orchestration";
import { useStore } from "../../store";
import { usePanels } from "./panel-store";
import { RunSitePanelBody } from "./RunSitePanelBody";

const run: OrchestrationRun = {
  id: "run",
  template: "manual",
  title: "Review login",
  status: "paused",
  pauseReason: "Awaiting review",
  createdAt: 1,
  updatedAt: 2,
  providerSessions: [],
  traceIds: [],
  permissionRequestIds: [],
  userInputRequestIds: [],
  steps: [
    {
      id: "s",
      title: "Inspect changes",
      kind: "review",
      status: "completed",
      attempts: 1,
      createdAt: 1,
      updatedAt: 2,
    },
  ],
  checkpoints: [],
  budget: {},
  events: [],
};

it("updates lifecycle in place and reports unavailable source honestly", () => {
  useStore.setState({
    orchestrationRuns: { run },
    orchestrationRunsMissing: false,
    units: {},
  });
  render(<RunSitePanelBody runId="run" />);
  expect(screen.getByText("paused", { exact: true })).toBeVisible();
  expect(screen.getByText(/1 of 1 recorded steps/)).toBeVisible();
  act(() => useStore.setState({ orchestrationRunsMissing: true }));
  expect(screen.getByText("unavailable", { exact: true })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("not live status");
  act(() =>
    useStore.setState({
      orchestrationRunsMissing: false,
      orchestrationRuns: { run: { ...run, status: "completed" } },
    })
  );
  expect(screen.getAllByText("completed", { exact: true })).toHaveLength(2);
});

it("opens existing run controls and handles deleted records", () => {
  usePanels.getState().closeAll();
  useStore.setState({
    orchestrationRuns: { run },
    orchestrationRunsMissing: false,
    units: {},
  });
  render(<RunSitePanelBody runId="run" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Open Run board controls" })
  );
  expect(
    usePanels.getState().panels.find((p) => p.kind === "kingdom")?.data
  ).toEqual({ initialTab: "runs" });
  act(() => useStore.setState({ orchestrationRuns: {} }));
  expect(screen.getByText("This run is no longer available.")).toBeVisible();
});
