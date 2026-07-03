import { describe, expect, it } from "vitest";
import type { AgentEvent, AgentTool } from "./events";
import { projectTraces } from "./traces";

function event(
  tool: AgentTool,
  sessionId: string,
  timestamp: number,
  kind: AgentEvent["kind"],
  payload: AgentEvent["payload"] = {},
  source: AgentEvent["source"] = "hook"
): AgentEvent {
  return {
    sessionId,
    tool,
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp,
    kind,
    payload,
    source,
  };
}

describe("projectTraces", () => {
  it("groups events by provider and session", () => {
    const traces = projectTraces([
      event("claude", "claude-1", 1, "session_start"),
      event("codex", "codex-1", 2, "session_start"),
      event("cursor", "cursor-1", 3, "session_start"),
      event("gemini", "gemini-1", 4, "session_start"),
    ]);

    expect(traces.map((trace) => trace.traceId)).toEqual([
      "trace:claude:claude-1",
      "trace:codex:codex-1",
      "trace:cursor:cursor-1",
      "trace:gemini:gemini-1",
    ]);
  });

  it("projects turns, tools, permission waits, errors, and completion", () => {
    const traces = projectTraces([
      event("claude", "s1", 1, "session_start"),
      event("claude", "s1", 2, "user_prompt", {
        text: "run focused tests",
      }),
      event("claude", "s1", 3, "tool_use", {
        name: "Bash",
        input: { command: "pnpm test" },
      }),
      event("claude", "s1", 6, "tool_result", {
        name: "Bash",
        output: "passed",
      }),
      event("claude", "s1", 7, "permission_request", {
        requestId: "perm-1",
        name: "Edit",
        input: { file_path: "src/app.ts" },
      }),
      event("claude", "s1", 9, "permission_resolved", {
        requestId: "perm-1",
        decision: "allow",
      }),
      event("claude", "s1", 10, "error", { error: "lint failed" }),
      event("claude", "s1", 12, "session_end"),
    ]);

    const trace = traces[0];
    expect(trace.status).toBe("error");
    expect(trace.endedAt).toBe(12);

    const turn = trace.spans.find((span) => span.kind === "turn");
    expect(turn).toMatchObject({
      name: "prompt turn",
      status: "error",
      startTime: 2,
      endTime: 12,
    });

    const tool = trace.spans.find((span) => span.kind === "tool");
    expect(tool).toMatchObject({
      name: "Bash",
      status: "ok",
      startTime: 3,
      endTime: 6,
      durationMs: 3,
    });
    expect(tool?.content).toMatchObject({
      redacted: true,
      summary: '{"command":"pnpm test"}',
    });

    const wait = trace.spans.find((span) => span.kind === "permission_wait");
    expect(wait).toMatchObject({
      status: "ok",
      startTime: 7,
      endTime: 9,
      durationMs: 2,
      attributes: {
        "request.id": "perm-1",
        "permission.decision": "allow",
      },
    });

    expect(trace.spans.some((span) => span.kind === "error")).toBe(true);
  });

  it("projects subagent and session-control spans", () => {
    const [trace] = projectTraces([
      event("codex", "s1", 1, "user_prompt", { text: "delegate" }),
      event("codex", "s1", 2, "subagent_spawn", {
        parentSessionId: "s1",
        text: "review module",
      }),
      event("codex", "s1", 3, "session_control", {
        controlAction: "interrupt",
        ok: true,
      }),
      event("codex", "s1", 4, "session_control", {
        controlAction: "stop",
        ok: false,
        reason: "not owned",
      }),
    ]);

    expect(trace.spans.find((span) => span.kind === "subagent")).toMatchObject({
      name: "subagent spawn",
      status: "ok",
      attributes: { "agent.parent.session.id": "s1" },
    });
    expect(
      trace.spans.filter((span) => span.kind === "session_control")
    ).toMatchObject([
      { name: "interrupt", status: "ok" },
      { name: "stop", status: "error" },
    ]);
    expect(trace.status).toBe("error");
  });

  it("keeps raw content out of projected traces unless explicitly requested", () => {
    const source = [
      event("gemini", "s1", 1, "user_prompt", {
        text: "secret prompt value",
      }),
    ];

    const [redacted] = projectTraces(source);
    expect(redacted.spans[1].content).toEqual({
      redacted: true,
      summary: "secret prompt value",
      size: 19,
    });

    const [metadataOnly] = projectTraces(source, {
      redactionPolicy: "metadata-only",
    });
    expect(metadataOnly.spans[1].content).toEqual({
      redacted: true,
      size: 19,
    });

    const [full] = projectTraces(source, { redactionPolicy: "full-content" });
    expect(full.spans[1].content).toMatchObject({
      redacted: false,
      text: "secret prompt value",
    });
  });

  it("leaves open waits active when no resolution event has arrived", () => {
    const [trace] = projectTraces([
      event("cursor", "s1", 1, "user_input_request", {
        requestId: "input-1",
        questions: [{ id: "choice", header: "Choice", question: "Pick one" }],
      }),
      event("cursor", "s1", 5, "assistant_text", { text: "still waiting" }),
    ]);

    expect(trace.status).toBe("active");
    expect(
      trace.spans.find((span) => span.kind === "user_input_wait")
    ).toMatchObject({
      status: "active",
      startTime: 1,
      endTime: 5,
      durationMs: 4,
    });
  });
});
