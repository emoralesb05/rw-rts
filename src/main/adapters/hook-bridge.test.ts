import { describe, expect, it } from "vitest";
import { normalizeHookPayload } from "./hook-bridge";

describe("hook bridge normalization", () => {
  it("normalizes Claude shell tool use", () => {
    const event = normalizeHookPayload({
      hook_event_name: "PreToolUse",
      session_id: "claude-session",
      cwd: "/repo",
      tool_name: "Bash",
      tool_input: { command: "git status" },
    });

    expect(event).toMatchObject({
      sessionId: "claude-session",
      tool: "claude",
      cwd: "/repo",
      kind: "tool_use",
      payload: {
        name: "Bash",
        input: { command: "git status" },
      },
      source: "hook",
    });
  });

  it("normalizes Gemini BeforeTool as an actionable permission request", () => {
    const event = normalizeHookPayload({
      hook_event_name: "BeforeTool",
      __kh_tool: "gemini",
      __kh_permission_request_id: "req-1",
      session_id: "gemini-session",
      cwd: "/repo",
      tool_name: "run_shell_command",
      tool_input: { command: "npm test" },
    });

    expect(event).toMatchObject({
      sessionId: "gemini-session",
      tool: "gemini",
      kind: "permission_request",
      payload: {
        name: "Bash",
        input: { command: "npm test" },
        requestId: "req-1",
      },
    });
  });

  it("normalizes Cursor assistant responses", () => {
    const event = normalizeHookPayload({
      hook_event_name: "afterAgentResponse",
      conversation_id: "chat-1",
      cwd: "/repo",
      text: "Done.",
    });

    expect(event).toMatchObject({
      sessionId: "cursor-chat-1",
      tool: "cursor",
      cwd: "/repo",
      kind: "assistant_text",
      payload: { text: "Done." },
    });
  });
});
