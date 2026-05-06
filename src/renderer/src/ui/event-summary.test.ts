import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@shared/events";
import { shortAgo, summarizeEvent } from "./event-summary";

function event(partial: Partial<AgentEvent>): AgentEvent {
  return {
    sessionId: "s1",
    tool: "claude",
    cwd: "/repo",
    timestamp: 1000,
    kind: "session_start",
    payload: {},
    source: "hook",
    ...partial,
  };
}

describe("activity event summaries", () => {
  it("summarizes shell tool use with command text", () => {
    expect(
      summarizeEvent(
        event({
          kind: "tool_use",
          payload: { name: "Bash", input: { command: "bun run test" } },
        })
      )
    ).toEqual({ text: "ran · bun run test", tone: "ok" });
  });

  it("summarizes permission requests as warnings", () => {
    expect(
      summarizeEvent(
        event({
          kind: "permission_request",
          payload: { name: "Edit", requestId: "r1" },
        })
      )
    ).toEqual({ text: "asked permission · Edit", tone: "warn" });
  });

  it("summarizes errors as danger", () => {
    expect(
      summarizeEvent(
        event({
          kind: "error",
          payload: { error: "failed hard\nsecond line" },
        })
      ).tone
    ).toBe("danger");
  });

  it("formats compact relative time", () => {
    expect(shortAgo(0, 12_000)).toBe("12s");
    expect(shortAgo(0, 4 * 60_000)).toBe("4m");
    expect(shortAgo(0, 2 * 60 * 60_000)).toBe("2h");
  });
});
