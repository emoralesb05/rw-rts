// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { AgentMonitorRecord } from "@shared/schemas";
import { InspectorControls } from "./InspectorControls";
import { useConversationDrafts } from "./conversation-drafts";
import { useStore } from "../store";

beforeEach(() => {
  useConversationDrafts.setState({ entries: {} });
  useStore.setState({ events: [] });
});

const agent: AgentMonitorRecord = {
  agentId: "codex:native",
  providerId: "codex",
  tool: "codex",
  nativeSessionId: "native",
  sourceLocalId: "local",
  displayName: "Test agent",
  cwd: "/repo",
  state: "working",
  stateReason: "Working",
  authority: "provider",
  confidence: "high",
  lastObservedAt: 1,
  spawnedHere: true,
  sources: [],
  evidence: [],
  usage: { coverage: "unavailable" },
  controls: [
    "send",
    "resume",
    "steer",
    "interrupt",
    "stop",
    "fork",
    "attach",
    "logs",
  ].map((action) => ({
    action,
    available: true,
    reason: "Supported",
  })) as AgentMonitorRecord["controls"],
};
it("explicitly steers active turns and preserves drafts on failed delivery", async () => {
  const controlSession = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, reason: "Turn changed" })
    .mockResolvedValueOnce({ ok: true });
  Object.defineProperty(window, "rw", {
    configurable: true,
    value: { controlSession },
  });
  render(<InspectorControls agent={agent} />);
  const input = screen.getByRole("textbox", { name: "Message selected agent" });
  fireEvent.change(input, { target: { value: "Please focus on tests" } });
  fireEvent.click(screen.getByRole("button", { name: "Steer active turn" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Turn changed")
  );
  expect(input).toHaveValue("Please focus on tests");
  expect(controlSession).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "steer",
      unitId: "local",
      sessionId: "native",
      prompt: "Please focus on tests",
    })
  );
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  await waitFor(() => expect(input).toHaveValue(""));
  expect(screen.getByRole("status")).toHaveTextContent(
    "waiting for provider activity"
  );
});
it("keeps separate drafts across agent switches and drawer remounts", () => {
  const second = {
    ...agent,
    agentId: "claude:native",
    providerId: "claude",
    tool: "claude" as const,
  };
  const view = render(<InspectorControls agent={agent} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Codex draft" },
  });
  view.rerender(<InspectorControls agent={second} />);
  expect(screen.getByRole("textbox")).toHaveValue("");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Claude draft" },
  });
  view.unmount();
  render(<InspectorControls agent={agent} />);
  expect(screen.getByRole("textbox")).toHaveValue("Codex draft");
});
it("explicitly resumes ended sessions without disguising their status", async () => {
  const controlSession = vi.fn().mockResolvedValue({ ok: true });
  Object.defineProperty(window, "rw", {
    configurable: true,
    value: { controlSession },
  });
  render(<InspectorControls agent={{ ...agent, state: "done" }} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Continue" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Resume with message" }));
  await waitFor(() =>
    expect(controlSession).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "resume",
        status: "complete",
        prompt: "Continue",
      })
    )
  );
});
it("keeps an in-flight send bound to its agent when selection changes", async () => {
  let finish!: (result: { ok: boolean }) => void;
  const controlSession = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  Object.defineProperty(window, "rw", {
    configurable: true,
    value: { controlSession },
  });
  const view = render(<InspectorControls agent={agent} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
  fireEvent.click(screen.getByRole("button", { name: "Steer active turn" }));
  view.rerender(
    <InspectorControls
      agent={{ ...agent, nativeSessionId: "second", agentId: "codex:second" }}
    />
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Second draft" },
  });
  finish({ ok: true });
  await waitFor(() => expect(controlSession).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("textbox")).toHaveValue("Second draft");
  view.rerender(<InspectorControls agent={agent} />);
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
  expect(screen.getByRole("status")).toHaveTextContent(
    "accepted by Realmkeeper"
  );
});
it.each(["blocked", "unknown", "offline"] as const)(
  "does not send to %s agents",
  (state) => {
    const controlSession = vi.fn();
    Object.defineProperty(window, "rw", {
      configurable: true,
      value: { controlSession },
    });
    render(<InspectorControls agent={{ ...agent, state }} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(controlSession).not.toHaveBeenCalled();
  }
);
it("labels observed resume separately and rejects missing identity", () => {
  const view = render(
    <InspectorControls
      agent={{ ...agent, state: "idle", spawnedHere: false }}
    />
  );
  expect(
    screen.getByRole("button", { name: "Resume with message" })
  ).toBeVisible();
  expect(
    screen.getByText(/not input into the original terminal/)
  ).toBeVisible();
  view.rerender(
    <InspectorControls agent={{ ...agent, nativeSessionId: undefined }} />
  );
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Interrupt" })).toBeDisabled();
});
it("distinguishes acceptance from subsequent scoped provider activity", async () => {
  const controlSession = vi.fn().mockResolvedValue({ ok: true });
  Object.defineProperty(window, "rw", {
    configurable: true,
    value: { controlSession },
  });
  const view = render(<InspectorControls agent={agent} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Continue" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Steer active turn" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "accepted by Realmkeeper"
    )
  );
  const event = {
    sessionId: "native",
    tool: "claude" as const,
    cwd: "/repo",
    timestamp: Date.now(),
    kind: "assistant_text" as const,
    payload: { text: "Other provider" },
    source: "hook" as const,
  };
  act(() => useStore.setState({ events: [event] }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "waiting for provider activity"
  );
  act(() =>
    useStore.setState({
      events: [{ ...event, tool: "codex", kind: "user_prompt" }],
    })
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "waiting for provider activity"
  );
  act(() =>
    useStore.setState({
      events: [{ ...event, tool: "codex", kind: "tool_use" }],
    })
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Provider activity observed"
  );
  act(() => useStore.setState({ events: [{ ...event, tool: "codex" }] }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "Assistant reply observed"
  );
  act(() =>
    useStore.setState({ events: [{ ...event, tool: "codex", kind: "error" }] })
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Session error observed"
  );
  view.rerender(<InspectorControls agent={{ ...agent, state: "offline" }} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "delivery is unconfirmed"
  );
  expect(screen.getByRole("textbox")).toBeDisabled();
});
