// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { MonitorAttentionItem } from "@shared/schemas";
import { AttentionRail } from "./AttentionRail";

const item: MonitorAttentionItem = {
  attentionId: "permission:codex:s",
  occurrenceId: "one",
  agentId: "codex:s",
  kind: "permission",
  severity: "critical",
  title: "Permission needed",
  summary: "Waiting for permission",
  sourceId: "realmkeeper-events",
  openedAt: 1000,
  updatedAt: 1000,
  lifecycle: "open",
};
it("sends only notification choices and keeps acknowledged blockers visible", async () => {
  const updateAttention = vi.fn().mockResolvedValue(true);
  const resolvePermission = vi.fn();
  Object.defineProperty(window, "rw", {
    configurable: true,
    value: { updateAttention, resolvePermission },
  });
  const props = {
    items: [item],
    integrations: [],
    onSelectAgent: vi.fn(),
    now: 2000,
  };
  const view = render(<AttentionRail {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  await waitFor(() =>
    expect(updateAttention).toHaveBeenCalledWith({
      attentionId: item.attentionId,
      occurrenceId: "one",
      action: "acknowledge",
    })
  );
  view.rerender(
    <AttentionRail
      {...props}
      items={[{ ...item, lifecycle: "acknowledged" }]}
    />
  );
  expect(screen.getByText("Acknowledged · still unresolved")).toBeVisible();
  expect(
    screen.getByRole("button", { name: /Permission needed/ })
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Snooze 15m" }));
  await waitFor(() =>
    expect(updateAttention).toHaveBeenLastCalledWith({
      attentionId: item.attentionId,
      occurrenceId: "one",
      action: "snooze",
    })
  );
  view.rerender(
    <AttentionRail
      {...props}
      items={[{ ...item, lifecycle: "snoozed", snoozedUntil: 901000 }]}
    />
  );
  expect(screen.getByText(/Blockers remain unresolved/)).toBeVisible();
  fireEvent.click(screen.getByText("Snoozed (1)"));
  fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
  await waitFor(() =>
    expect(updateAttention).toHaveBeenLastCalledWith({
      attentionId: item.attentionId,
      occurrenceId: "one",
      action: "reopen",
    })
  );
  expect(resolvePermission).not.toHaveBeenCalled();
});

it("shows a failed update without optimistically hiding the alert", async () => {
  Object.defineProperty(window, "rw", {
    configurable: true,
    value: { updateAttention: vi.fn().mockRejectedValue(new Error("stale")) },
  });
  render(
    <AttentionRail
      items={[item]}
      integrations={[]}
      onSelectAgent={vi.fn()}
      now={2000}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Snooze 15m" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "request was not answered"
    )
  );
  expect(
    screen.getByRole("button", { name: /Permission needed/ })
  ).toBeVisible();
  expect(screen.queryByText("Snoozed (1)")).not.toBeInTheDocument();
});
