import { describe, expect, it } from "vitest";
import {
  cancelPermissionRequest,
  pendingPermissionCount,
  registerPermissionRequest,
  resolvePermissionRequest,
} from "./hook-bridge";
import { normalizeHookPayload } from "./hook-normalizer";

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
      __rw_tool: "gemini",
      __rw_permission_request_id: "req-1",
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
        permissionMode: "actionable",
        permissionOptions: [
          expect.objectContaining({ id: "allow-once", decision: "allow" }),
          expect.objectContaining({ id: "deny", decision: "deny" }),
        ],
      },
    });
  });

  it("normalizes Gemini hook lifecycle payloads", () => {
    expect(
      normalizeHookPayload({
        hook_event_name: "BeforeTool",
        __rw_tool: "gemini",
        session_id: "gemini-session",
        cwd: "/repo",
        tool_name: "read_file",
        tool_input: { absolute_path: "/repo/package.json" },
      })
    ).toMatchObject({
      sessionId: "gemini-session",
      tool: "gemini",
      cwd: "/repo",
      source: "hook",
      kind: "tool_use",
      payload: {
        name: "Read",
        input: { absolute_path: "/repo/package.json" },
      },
    });

    expect(
      normalizeHookPayload({
        hook_event_name: "AfterTool",
        __rw_tool: "gemini",
        session_id: "gemini-session",
        cwd: "/repo",
        tool_name: "run_shell_command",
        tool_input: { command: "pnpm test" },
        tool_response: { exit_code: 0, output: "ok" },
      })
    ).toMatchObject({
      sessionId: "gemini-session",
      tool: "gemini",
      kind: "tool_result",
      payload: {
        name: "Bash",
        input: { command: "pnpm test" },
        output: { exit_code: 0, output: "ok" },
      },
    });

    expect(
      normalizeHookPayload({
        hook_event_name: "AfterAgent",
        __rw_tool: "gemini",
        session_id: "gemini-session",
        cwd: "/repo",
        prompt_response: "Done.",
      })
    ).toMatchObject({
      sessionId: "gemini-session",
      tool: "gemini",
      kind: "assistant_text",
      payload: { text: "Done." },
    });
  });

  it("ignores Gemini advisory permission notifications", () => {
    expect(
      normalizeHookPayload({
        hook_event_name: "Notification",
        __rw_tool: "gemini",
        session_id: "gemini-session",
        cwd: "/repo",
        notification_type: "ToolPermission",
        tool_name: "run_shell_command",
      })
    ).toBeNull();
  });

  it("attaches Gemini subagent hook payloads to their parent session", () => {
    const event = normalizeHookPayload({
      hook_event_name: "AfterTool",
      __rw_tool: "gemini",
      session_id: "child-session",
      cwd: "/repo",
      transcript_path:
        "/Users/ed/.gemini/tmp/chats/parent-session/child-session.jsonl",
      tool_name: "invoke_agent",
      tool_input: { agent_name: "reviewer" },
      tool_response: { status: "complete" },
    });

    expect(event).toMatchObject({
      sessionId: "child-session",
      tool: "gemini",
      kind: "tool_result",
      payload: {
        name: "Agent",
        parentSessionId: "parent-session",
        input: { agent_name: "reviewer" },
        output: { status: "complete" },
      },
    });
  });

  it("normalizes Cursor shell confirmations as native-ui permission options", () => {
    const event = normalizeHookPayload({
      hook_event_name: "beforeShellExecution",
      conversation_id: "chat-1",
      cwd: "/repo",
      command: "npm test",
      __rw_permission_request_id: "req-cursor",
    });

    expect(event).toMatchObject({
      sessionId: "cursor-chat-1",
      tool: "cursor",
      kind: "permission_request",
      payload: {
        name: "Bash",
        requestId: "req-cursor",
        permissionMode: "observe",
        permissionOptions: [
          expect.objectContaining({ id: "ack-native", decision: "observe" }),
        ],
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

  it("resolves callback-backed permission requests", () => {
    let resolved:
      | {
          decision: string;
          message?: string;
          optionId?: string;
        }
      | undefined;

    const registered = registerPermissionRequest(
      {
        sessionId: "codex-thread",
        tool: "codex",
        cwd: "/repo",
        source: "spawned",
      },
      "req-callback",
      [
        {
          id: "allow-once",
          label: "allow",
          decision: "allow",
        },
        {
          id: "deny",
          label: "deny",
          decision: "deny",
        },
      ],
      (resolution) => {
        resolved = resolution;
      }
    );

    expect(registered).toBe(true);
    expect(pendingPermissionCount()).toBeGreaterThan(0);
    expect(
      resolvePermissionRequest("req-callback", "allow", undefined, "allow-once")
    ).toBe(true);
    expect(resolved).toEqual({
      decision: "allow",
      optionId: "allow-once",
      message: undefined,
    });
    expect(cancelPermissionRequest("req-callback")).toBe(false);
  });
});
