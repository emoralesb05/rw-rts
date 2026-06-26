// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationStream } from "./ConversationStream";
import { useStore } from "../store";
import type { AgentEvent, UnitState } from "@shared/events";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: string }) => <>{children}</>,
}));
vi.mock("@streamdown/code", () => ({ code: {} }));
vi.mock("@streamdown/mermaid", () => ({ mermaid: {} }));
vi.mock("@streamdown/math", () => ({ math: {} }));
vi.mock("@streamdown/cjk", () => ({ cjk: {} }));

function unit(
  sessionId: string,
  displayName: string,
  parentSessionId?: string
): UnitState {
  return {
    id: sessionId,
    sessionId,
    tool: "claude",
    role: "warden1",
    displayName,
    cwd: "/repo",
    repoRoot: "/repo",
    worldId: "world-1",
    hp: 100,
    mp: 100,
    status: "working",
    lastActivity: 1,
    spawnedHere: false,
    parentSessionId,
  };
}

function event(
  sessionId: string,
  timestamp: number,
  kind: AgentEvent["kind"],
  payload: AgentEvent["payload"],
  source: AgentEvent["source"] = "hook"
): AgentEvent {
  return {
    sessionId,
    tool: "claude",
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp,
    kind,
    payload,
    source,
  };
}

describe("ConversationStream", () => {
  afterEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it("groups consecutive global events under one unit badge", () => {
    useStore.setState({
      units: { "s-1": unit("s-1", "Faolan") },
      events: [
        event("s-1", 3, "assistant_text", { text: "I can do that." }),
        event("s-1", 2, "user_prompt", { text: "Please check the repo." }),
        event("s-1", 1, "session_start", {}),
      ],
      mutedSessionIds: {},
    });

    render(<ConversationStream cap={10} />);

    expect(screen.getAllByText("Faolan")).toHaveLength(1);
    expect(screen.getByText("Please check the repo.")).toBeInTheDocument();
    expect(screen.getByText("I can do that.")).toBeInTheDocument();
  });

  it("includes subagent events when rendering a parent session stream", () => {
    useStore.setState({
      units: {
        parent: unit("parent", "Faolan"),
        child: unit("child", "Aerin", "parent"),
        other: unit("other", "Ryder"),
      },
      events: [
        event("other", 4, "assistant_text", { text: "not this wielder" }),
        event("child", 3, "assistant_text", { text: "subagent answer" }),
        event("parent", 2, "user_prompt", { text: "delegate this" }),
        event("parent", 1, "session_start", {}),
      ],
      mutedSessionIds: {},
    });

    render(<ConversationStream sessionId="parent" cap={10} />);

    expect(screen.getByText("delegate this")).toBeInTheDocument();
    expect(screen.getByText("subagent answer")).toBeInTheDocument();
    expect(screen.queryByText("not this wielder")).not.toBeInTheDocument();
  });

  it("marks user prompts originated through Realmkeeper resume", () => {
    useStore.setState({
      units: { "s-1": unit("s-1", "Faolan") },
      events: [
        event(
          "s-1",
          1,
          "user_prompt",
          { text: "continue the investigation" },
          "realmkeeper"
        ),
      ],
      mutedSessionIds: {},
    });

    render(<ConversationStream sessionId="s-1" cap={10} />);

    expect(screen.getByText("via Realmkeeper")).toBeInTheDocument();
    expect(screen.getByText("continue the investigation")).toBeInTheDocument();
  });
});
