import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@shared/events";
import { classifyArchetype } from "./role-archetype";

function toolUse(sessionId: string, name: string): AgentEvent {
  return {
    sessionId,
    tool: "claude",
    cwd: "/repo",
    timestamp: Date.now(),
    kind: "tool_use",
    payload: { name },
    source: "hook",
  };
}

describe("wielder archetype classification", () => {
  it("returns roamer until enough tool calls exist", () => {
    expect(classifyArchetype("s1", [toolUse("s1", "Bash")])).toBe("roamer");
  });

  it("classifies bash-heavy sessions as tank", () => {
    expect(
      classifyArchetype("s1", [
        toolUse("s1", "Bash"),
        toolUse("s1", "Bash"),
        toolUse("s1", "Bash"),
        toolUse("s1", "Read"),
        toolUse("s1", "Edit"),
      ])
    ).toBe("tank");
  });

  it("classifies inspection-heavy sessions as healer", () => {
    expect(
      classifyArchetype("s1", [
        toolUse("s1", "Read"),
        toolUse("s1", "Glob"),
        toolUse("s1", "Grep"),
        toolUse("s1", "Bash"),
        toolUse("s1", "Edit"),
      ])
    ).toBe("healer");
  });

  it("classifies edit-heavy sessions as dps", () => {
    expect(
      classifyArchetype("s1", [
        toolUse("s1", "Edit"),
        toolUse("s1", "Write"),
        toolUse("s1", "MultiEdit"),
        toolUse("s1", "Bash"),
        toolUse("s1", "Read"),
      ])
    ).toBe("dps");
  });

  it("ignores events from other sessions", () => {
    expect(
      classifyArchetype("s1", [
        toolUse("other", "Bash"),
        toolUse("other", "Bash"),
        toolUse("other", "Bash"),
        toolUse("s1", "Read"),
        toolUse("s1", "Read"),
        toolUse("s1", "Read"),
        toolUse("s1", "Glob"),
        toolUse("s1", "Grep"),
      ])
    ).toBe("healer");
  });
});
