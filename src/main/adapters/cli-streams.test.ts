import { describe, expect, it } from "vitest";
import { normalizeStreamMessage } from "./claude-cli";
import { normalizeCodexStreamMessage } from "./codex-cli";
import { normalizeCursorStreamMessage } from "./cursor-cli";

describe("active CLI stream normalization", () => {
  it("normalizes Claude assistant text and tool calls", () => {
    const events = normalizeStreamMessage(
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Done." },
            { type: "tool_use", name: "Bash", input: { command: "pwd" } },
          ],
        },
      },
      "s1",
      "/repo"
    );

    expect(events).toMatchObject([
      {
        sessionId: "s1",
        tool: "claude",
        cwd: "/repo",
        kind: "assistant_text",
        payload: { text: "Done." },
      },
      {
        sessionId: "s1",
        tool: "claude",
        cwd: "/repo",
        kind: "tool_use",
        payload: { name: "Bash", input: { command: "pwd" } },
      },
    ]);
  });

  it("normalizes Codex command executions into tool use and result events", () => {
    const events = normalizeCodexStreamMessage(
      {
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "bun test",
          aggregated_output: "ok",
        },
      },
      "thread-1",
      "/repo"
    );

    expect(events).toMatchObject([
      {
        sessionId: "thread-1",
        tool: "codex",
        kind: "tool_use",
        payload: { name: "Bash", input: { command: "bun test" } },
      },
      {
        sessionId: "thread-1",
        tool: "codex",
        kind: "tool_result",
        payload: { output: "ok" },
      },
    ]);
  });

  it("normalizes Cursor completed tool calls", () => {
    const events = normalizeCursorStreamMessage(
      {
        type: "tool_call",
        subtype: "completed",
        tool_call: {
          shellToolCall: {
            args: { command: "pwd" },
            result: "/repo",
          },
        },
      },
      "cursor-1",
      "/repo"
    );

    expect(events).toMatchObject([
      {
        sessionId: "cursor-1",
        tool: "cursor",
        kind: "tool_use",
        payload: { name: "shell", input: { command: "pwd" } },
      },
      {
        sessionId: "cursor-1",
        tool: "cursor",
        kind: "tool_result",
        payload: { output: "/repo" },
      },
    ]);
  });
});
