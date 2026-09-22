import { describe, expect, it } from "vitest";
import type { AgentEvent, AgentTool } from "./events";
import { exportTracesToOtel } from "./trace-export";
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

function spanAttributes(exported: ReturnType<typeof exportTracesToOtel>) {
  const span = exported.resourceSpans[0].scopeSpans[0].spans[1];
  return new Map(span.attributes.map((attr) => [attr.key, attr.value]));
}

describe("exportTracesToOtel", () => {
  it("exports projected traces as stable OTel-shaped spans", () => {
    const traces = projectTraces([
      event("claude", "s1", 1_000, "session_start"),
      event("claude", "s1", 2_000, "user_prompt", {
        text: "run tests",
      }),
      event("claude", "s1", 3_000, "tool_use", {
        name: "Bash",
        input: { command: "pnpm test" },
      }),
      event("claude", "s1", 5_000, "tool_result", {
        name: "Bash",
        output: "passed",
      }),
      event("claude", "s1", 6_000, "session_end"),
    ]);

    const exported = exportTracesToOtel(traces, {
      serviceName: "realmkeeper-test",
      serviceVersion: "0.7.0",
    });

    expect(exported.resourceSpans[0].resource.attributes).toContainEqual({
      key: "service.name",
      value: { stringValue: "realmkeeper-test" },
    });
    expect(exported.resourceSpans[0].scopeSpans[0].scope).toEqual({
      name: "realmkeeper.trace-export",
      version: "0.7.0",
    });

    const spans = exported.resourceSpans[0].scopeSpans[0].spans;
    expect(spans.map((span) => span.name)).toEqual([
      "claude session",
      "prompt turn",
      "Bash",
    ]);
    expect(spans[0].traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(spans[0].spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(spans[1].parentSpanId).toBe(spans[0].spanId);
    expect(spans[0].startTimeUnixNano).toBe("1000000000");
    expect(spans[0].endTimeUnixNano).toBe("6000000000");
    expect(spans[0].status.code).toBe("STATUS_CODE_OK");

    const attrs = spanAttributes(exported);
    expect(attrs.get("gen_ai.system")).toEqual({ stringValue: "claude" });
    expect(attrs.get("gen_ai.conversation.id")).toEqual({ stringValue: "s1" });
    expect(attrs.get("rk.event.ids")).toEqual({
      arrayValue: {
        values: [
          {
            stringValue: "event:claude:s1:2000:user_prompt:hook:0",
          },
        ],
      },
    });
  });

  it("keeps prompt and tool content metadata-only by default", () => {
    const traces = projectTraces([
      event("codex", "s1", 1, "user_prompt", {
        text: "secret prompt value",
      }),
      event("codex", "s1", 2, "tool_use", {
        name: "Shell",
        input: { command: "cat secrets.txt" },
      }),
    ]);

    const exported = exportTracesToOtel(traces);
    const json = JSON.stringify(exported);

    expect(json).not.toContain("secret prompt value");
    expect(json).not.toContain("cat secrets.txt");
    expect(json).toContain("rk.content.redacted");
    expect(json).toContain("rk.content.size");
  });

  it("allows summaries and full content only when explicitly requested", () => {
    const traces = projectTraces(
      [
        event("gemini", "s1", 1, "user_prompt", {
          text: "secret prompt value",
        }),
      ],
      { redactionPolicy: "full-content" }
    );

    expect(JSON.stringify(exportTracesToOtel(traces))).not.toContain(
      "secret prompt value"
    );
    expect(
      JSON.stringify(exportTracesToOtel(traces, { contentMode: "summaries" }))
    ).toContain("secret prompt value");
    expect(
      JSON.stringify(
        exportTracesToOtel(traces, { contentMode: "full-content" })
      )
    ).toContain("secret prompt value");
  });

  it("marks error spans with OTel error status", () => {
    const traces = projectTraces([
      event("cursor", "s1", 1, "session_start"),
      event("cursor", "s1", 2, "error", { error: "provider failed" }),
    ]);

    const spans =
      exportTracesToOtel(traces).resourceSpans[0].scopeSpans[0].spans;

    expect(spans.find((span) => span.name === "error")).toMatchObject({
      status: { code: "STATUS_CODE_ERROR" },
    });
    expect(spans[0]).toMatchObject({
      name: "cursor session",
      status: { code: "STATUS_CODE_ERROR" },
    });
  });

  it("exports known provider usage as OTel span attributes", () => {
    const traces = projectTraces([
      event("claude", "s1", 1, "session_start"),
      event("claude", "s1", 2, "session_end", {
        output: {
          input_tokens: 120,
          output_tokens: 30,
          total_cost_usd: 0.0042,
        },
      }),
    ]);

    const rootSpan =
      exportTracesToOtel(traces).resourceSpans[0].scopeSpans[0].spans[0];
    const attrs = new Map(
      rootSpan.attributes.map((attr) => [attr.key, attr.value])
    );

    expect(attrs.get("gen_ai.usage.input_tokens")).toEqual({
      intValue: "120",
    });
    expect(attrs.get("gen_ai.usage.output_tokens")).toEqual({
      intValue: "30",
    });
    expect(attrs.get("gen_ai.usage.total_tokens")).toEqual({
      intValue: "150",
    });
    expect(attrs.get("gen_ai.usage.cost_usd")).toEqual({
      doubleValue: 0.0042,
    });
  });
});
