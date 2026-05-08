import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@shared/events";
import {
  activityColorForTheme,
  activityForEvent,
  activityForToolName,
  activityLabel,
} from "./world-aliveness";

function event(kind: AgentEvent["kind"], payload = {}): AgentEvent {
  return {
    sessionId: "session-1",
    tool: "claude",
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp: 1,
    source: "hook",
    kind,
    payload,
  } as AgentEvent;
}

describe("world aliveness classification", () => {
  it("groups provider tool names into visual activity families", () => {
    expect(activityForToolName("Bash")).toBe("shell");
    expect(activityForToolName("run_terminal_command_v2")).toBe("shell");
    expect(activityForToolName("Read")).toBe("read");
    expect(activityForToolName("apply_patch")).toBe("edit");
    expect(activityForToolName("grep_search")).toBe("search");
    expect(activityForToolName("WebFetch")).toBe("web");
    expect(activityForToolName("Task")).toBe("subagent");
  });

  it("maps non-tool events to world activity moments", () => {
    expect(activityForEvent(event("permission_request"))).toBe("permission");
    expect(activityForEvent(event("error"))).toBe("error");
    expect(activityForEvent(event("tool_result"))).toBe("success");
    expect(activityForEvent(event("assistant_text"))).toBeNull();
  });

  it("treats failed tool results as error activity", () => {
    expect(
      activityForEvent(event("tool_result", { output: { is_error: true } }))
    ).toBe("error");
    expect(
      activityForEvent(event("tool_result", { output: "<tool_use_error>no" }))
    ).toBe("error");
    expect(activityForEvent(event("tool_result", { error: "failed" }))).toBe(
      "error"
    );
  });

  it("varies activity color by theme while keeping labels stable", () => {
    expect(activityColorForTheme("hollow", "permission")).toBe(0xc9a4ff);
    expect(activityColorForTheme("halloween", "shell")).toBe(0xffb86c);
    expect(activityColorForTheme("destiny", "web")).toBe(0x6cd5ff);
    expect(activityLabel("search")).toBe("scan");
  });
});
