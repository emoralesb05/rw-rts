// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it } from "vitest";
import { MonitorHistory } from "./MonitorHistory";

it("labels historical blockers as unconfirmed and offers no intervention", () => {
  render(
    <MonitorHistory
      history={{
        entries: [
          {
            agentId: "codex:old",
            providerId: "codex",
            state: "blocked",
            lastObservedAt: 1000,
          },
        ],
        gaps: [{ from: 1000, to: 2000 }],
      }}
    />
  );
  expect(screen.getByText(/Monitoring gap:/)).toBeVisible();
  fireEvent.click(screen.getByText(/Last seen history/));
  expect(screen.getByText(/Previously blocked/)).toBeVisible();
  expect(screen.getByText(/Previous blockers are unconfirmed/)).toBeVisible();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});
