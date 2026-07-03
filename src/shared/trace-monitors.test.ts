import { describe, expect, it } from "vitest";
import type { AgentEvent, AgentTool } from "./events";
import { evaluateTraceMonitors } from "./trace-monitors";
import { projectTraces } from "./traces";

function event(
  timestamp: number,
  kind: AgentEvent["kind"],
  payload: AgentEvent["payload"] = {},
  tool: AgentTool = "codex"
): AgentEvent {
  return {
    sessionId: "s1",
    tool,
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp,
    kind,
    payload,
    source: "realmkeeper",
  };
}

describe("evaluateTraceMonitors", () => {
  it("signals active permission and input waits after the threshold", () => {
    const traces = projectTraces([
      event(1_000, "permission_request", {
        requestId: "perm-1",
        name: "Edit",
      }),
      event(
        2_000,
        "user_input_request",
        {
          requestId: "input-1",
          questions: [{ id: "choice", header: "Choice", question: "Pick one" }],
        },
        "claude"
      ),
    ]);

    expect(
      evaluateTraceMonitors(traces, { now: 40_000, waitMs: 30_000 }).map(
        (signal) => signal.title
      )
    ).toEqual(["Waiting for input", "Waiting for permission"]);
  });

  it("signals slow tools and stale active traces", () => {
    const traces = projectTraces([
      event(1_000, "tool_use", {
        name: "Bash",
        input: { command: "sleep 120" },
      }),
      event(5_000, "assistant_text", { text: "still thinking" }, "cursor"),
    ]);

    const signals = evaluateTraceMonitors(traces, {
      now: 130_000,
      slowToolMs: 60_000,
      staleTraceMs: 60_000,
    });

    expect(signals.map((signal) => signal.kind).sort()).toEqual([
      "slow_tool",
      "stale_trace",
    ]);
    expect(signals.find((signal) => signal.kind === "slow_tool")).toMatchObject(
      {
        title: "Slow tool",
        detail: "Bash has run longer than expected.",
      }
    );
  });

  it("returns recent errors first and suppresses old errors", () => {
    const traces = projectTraces([
      event(1_000, "error", { error: "old failure" }),
      event(100_000, "session_control", {
        controlAction: "stop",
        ok: false,
        reason: "recent failure",
      }),
    ]);

    const signals = evaluateTraceMonitors(traces, {
      now: 110_000,
      recentErrorWindowMs: 30_000,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      kind: "error_trace",
      severity: "critical",
      detail: "recent failure",
    });
  });
});
