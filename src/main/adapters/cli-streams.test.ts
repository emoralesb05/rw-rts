import { describe, expect, it } from "vitest";
import { normalizeStreamMessage } from "./claude-cli";
import {
  buildCodexAppServerPermissionEvent,
  buildThreadResumeParams,
  buildThreadStartParams,
  buildTurnStartParams,
  buildTurnSteerParams,
  codexAppServerPermissionResponse,
  normalizeCodexAppServerNotification,
} from "./codex-app-server";
import { normalizeCodexStreamMessage } from "./codex-cli";
import { normalizeCursorStreamMessage } from "./cursor-cli";
import { buildGeminiArgs } from "./gemini-cli";

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

  it("builds Codex app-server thread, resume, turn, and steer params", () => {
    expect(buildThreadStartParams("/repo")).toEqual({
      cwd: "/repo",
      approvalPolicy: "never",
      sandbox: "workspace-write",
      serviceName: "realmkeeper",
    });
    expect(buildThreadResumeParams("thread-1", "/repo")).toEqual({
      threadId: "thread-1",
      cwd: "/repo",
      approvalPolicy: "never",
      sandbox: "workspace-write",
    });
    expect(buildTurnStartParams("thread-1", "/repo", "map it")).toEqual({
      threadId: "thread-1",
      cwd: "/repo",
      approvalPolicy: "never",
      input: [{ type: "text", text: "map it", text_elements: [] }],
    });
    expect(buildTurnSteerParams("thread-1", "turn-1", "adjust")).toEqual({
      threadId: "thread-1",
      expectedTurnId: "turn-1",
      input: [{ type: "text", text: "adjust", text_elements: [] }],
    });
  });

  it("normalizes Codex app-server notifications", () => {
    expect(
      normalizeCodexAppServerNotification(
        {
          method: "item/completed",
          params: {
            item: {
              type: "commandExecution",
              command: "bun test",
              aggregatedOutput: "ok",
              durationMs: 12,
            },
          },
        },
        "thread-1",
        "/repo"
      )
    ).toMatchObject([
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
        payload: { output: "ok", durationMs: 12 },
      },
    ]);

    expect(
      normalizeCodexAppServerNotification(
        {
          method: "turn/completed",
          params: { turn: { status: "completed" } },
        },
        "thread-1",
        "/repo"
      )
    ).toMatchObject([
      {
        sessionId: "thread-1",
        tool: "codex",
        kind: "session_end",
        payload: { text: "completed" },
      },
    ]);
  });

  it("maps Codex app-server approval requests to permission cards", () => {
    const event = buildCodexAppServerPermissionEvent({
      id: 7,
      method: "item/commandExecution/requestApproval",
      params: {
        command: "bun test",
        cwd: "/repo",
        reason: "needs test execution",
      },
      sessionId: "thread-1",
      cwd: "/repo",
      source: "spawned",
    });

    expect(event).toMatchObject({
      sessionId: "thread-1",
      tool: "codex",
      cwd: "/repo",
      source: "spawned",
      kind: "permission_request",
      payload: {
        name: "Bash",
        input: {
          command: "bun test",
          cwd: "/repo",
          reason: "needs test execution",
        },
        requestId: "codex-app-server:thread-1:7",
        permissionMode: "actionable",
        permissionOptions: [
          expect.objectContaining({ id: "allow-once", decision: "allow" }),
          expect.objectContaining({ id: "deny", decision: "deny" }),
        ],
      },
    });

    expect(
      codexAppServerPermissionResponse(
        "item/commandExecution/requestApproval",
        {},
        "allow"
      )
    ).toEqual({ decision: "accept" });
    expect(
      codexAppServerPermissionResponse(
        "item/fileChange/requestApproval",
        {},
        "deny"
      )
    ).toEqual({ decision: "decline" });
    expect(
      codexAppServerPermissionResponse(
        "item/permissions/requestApproval",
        {
          permissions: {
            network: null,
            fileSystem: { entries: [{ root: "/repo" }] },
          },
        },
        "allow"
      )
    ).toEqual({
      permissions: { fileSystem: { entries: [{ root: "/repo" }] } },
      scope: "turn",
    });
    expect(
      codexAppServerPermissionResponse("execCommandApproval", {}, "allow")
    ).toEqual({ decision: "approved" });
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

  it("builds Gemini spawn and resume args with stable session ids", () => {
    expect(
      buildGeminiArgs("map the repo", {
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).toEqual([
      "--prompt",
      "map the repo",
      "--output-format",
      "stream-json",
      "--approval-mode",
      "yolo",
      "--session-id",
      "550e8400-e29b-41d4-a716-446655440000",
    ]);

    expect(buildGeminiArgs("continue", { resumeId: "gemini-1" })).toEqual([
      "--prompt",
      "continue",
      "--output-format",
      "stream-json",
      "--approval-mode",
      "yolo",
      "--resume",
      "gemini-1",
    ]);
  });
});
