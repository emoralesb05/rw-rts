import { describe, expect, it } from "vitest";
import { buildClaudeArgs, normalizeStreamMessage } from "./claude-cli";
import {
  buildCodexAppServerArgs,
  buildCodexAppServerMcpElicitationEvent,
  buildCodexAppServerPermissionEvent,
  buildCodexAppServerUserInputEvent,
  buildThreadResumeParams,
  buildThreadStartParams,
  buildTurnStartParams,
  buildTurnSteerParams,
  codexAppServerMcpElicitationResponse,
  codexAppServerPermissionResponse,
  codexAppServerUserInputResponse,
  normalizeCodexAppServerNotification,
} from "./codex-app-server";
import { normalizeCodexStreamMessage } from "./codex-cli";
import { buildCursorArgs, normalizeCursorStreamMessage } from "./cursor-cli";
import { buildGeminiArgs, buildGeminiLaunchOptions } from "./gemini-cli";

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

  it("ignores Claude rich stream metadata until partial rendering is explicit", () => {
    for (const msg of [
      {
        type: "system",
        subtype: "hook_started",
        hook_name: "SessionStart:startup",
      },
      {
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: {} },
      },
      {
        type: "rate_limit_event",
        rate_limit_info: {},
      },
    ]) {
      expect(normalizeStreamMessage(msg, "s1", "/repo")).toEqual([]);
    }
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
    expect(buildCodexAppServerArgs()).toEqual(["app-server", "--stdio"]);

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

  it("maps Codex app-server user input requests to answerable events", () => {
    const event = buildCodexAppServerUserInputEvent({
      id: 8,
      method: "item/tool/requestUserInput",
      params: {
        itemId: "item-1",
        threadId: "thread-1",
        turnId: "turn-1",
        autoResolutionMs: 60000,
        questions: [
          {
            id: "approach",
            header: "Approach",
            question: "Which implementation should I use?",
            options: [
              {
                label: "Small",
                description: "Make the smallest compatible change.",
              },
              {
                label: "Broad",
                description: "Refactor the surrounding module too.",
              },
            ],
          },
        ],
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
      kind: "user_input_request",
      payload: {
        requestId: "codex-app-server:thread-1:8",
        name: "UserInput",
        text: "Which implementation should I use?",
        autoResolutionMs: 60000,
        questions: [
          {
            id: "approach",
            header: "Approach",
            question: "Which implementation should I use?",
            options: [
              {
                label: "Small",
                description: "Make the smallest compatible change.",
              },
              {
                label: "Broad",
                description: "Refactor the surrounding module too.",
              },
            ],
          },
        ],
      },
    });

    expect(
      codexAppServerUserInputResponse({
        approach: { answers: ["Small"] },
      })
    ).toEqual({
      answers: {
        approach: { answers: ["Small"] },
      },
    });
  });

  it("maps Codex app-server MCP elicitations to typed answerable events", () => {
    const params = {
      serverName: "github",
      threadId: "thread-1",
      turnId: "turn-1",
      mode: "form",
      message: "Choose repository metadata.",
      requestedSchema: {
        type: "object",
        required: ["repository", "notify"],
        properties: {
          repository: {
            type: "string",
            title: "Repository",
            description: "Which repository should the MCP server use?",
            oneOf: [
              { const: "rw-rts", title: "Realmkeeper" },
              { const: "other", title: "Other repo" },
            ],
          },
          tags: {
            type: "array",
            title: "Tags",
            description: "Optional labels to apply.",
            items: {
              anyOf: [
                { const: "provider", title: "Provider" },
                { const: "ui", title: "UI" },
              ],
            },
          },
          notify: {
            type: "boolean",
            title: "Notify",
            description: "Notify subscribers?",
          },
        },
      },
    };

    const event = buildCodexAppServerMcpElicitationEvent({
      id: 9,
      method: "mcpServer/elicitation/request",
      params,
      sessionId: "thread-1",
      cwd: "/repo",
      source: "spawned",
    });

    expect(event).toMatchObject({
      sessionId: "thread-1",
      tool: "codex",
      cwd: "/repo",
      source: "spawned",
      kind: "user_input_request",
      payload: {
        requestId: "codex-app-server:thread-1:9",
        name: "McpElicitation",
        text: "Choose repository metadata.",
        responseKind: "mcp-elicitation",
        questions: [
          {
            id: "repository",
            header: "Repository",
            question: "Which repository should the MCP server use?",
            required: true,
            options: [
              { label: "Realmkeeper", value: "rw-rts" },
              { label: "Other repo", value: "other" },
            ],
          },
          {
            id: "tags",
            header: "Tags",
            question: "Optional labels to apply.",
            required: false,
            multiSelect: true,
            options: [
              { label: "Provider", value: "provider" },
              { label: "UI", value: "ui" },
            ],
          },
          {
            id: "notify",
            header: "Notify",
            question: "Notify subscribers?",
            required: true,
            options: [
              { label: "Yes", value: "true" },
              { label: "No", value: "false" },
            ],
          },
        ],
      },
    });

    expect(
      codexAppServerMcpElicitationResponse(
        params,
        {
          repository: { answers: ["rw-rts"] },
          tags: { answers: ["provider", "ui"] },
          notify: { answers: ["true"] },
        },
        "accept"
      )
    ).toEqual({
      action: "accept",
      content: {
        repository: "rw-rts",
        tags: ["provider", "ui"],
        notify: true,
      },
      _meta: null,
    });

    expect(codexAppServerMcpElicitationResponse(params, {}, "decline")).toEqual(
      {
        action: "decline",
        content: null,
        _meta: null,
      }
    );
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

  it("builds Claude spawn and resume args with stable session ids", () => {
    expect(
      buildClaudeArgs("map the repo", {
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).toEqual([
      "-p",
      "map the repo",
      "--output-format",
      "stream-json",
      "--verbose",
      "--session-id",
      "550e8400-e29b-41d4-a716-446655440000",
    ]);

    expect(
      buildClaudeArgs("continue", {
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        resume: true,
      })
    ).toEqual([
      "-p",
      "continue",
      "--output-format",
      "stream-json",
      "--verbose",
      "--resume",
      "550e8400-e29b-41d4-a716-446655440000",
    ]);

    expect(
      buildClaudeArgs("observe hooks", {
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        includeHookEvents: true,
        includePartialMessages: true,
        promptSuggestions: true,
      })
    ).toEqual([
      "-p",
      "observe hooks",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-hook-events",
      "--include-partial-messages",
      "--prompt-suggestions",
      "--session-id",
      "550e8400-e29b-41d4-a716-446655440000",
    ]);
  });

  it("builds Cursor headless resume args for Realmkeeper-created chats", () => {
    expect(buildCursorArgs("map the repo", "chat-123")).toEqual([
      "--print",
      "--output-format",
      "stream-json",
      "--force",
      "--trust",
      "--resume",
      "chat-123",
      "map the repo",
    ]);

    expect(
      buildCursorArgs("review this", "chat-123", {
        force: false,
        trust: false,
        autoReview: true,
        approveMcps: true,
        sandbox: "enabled",
        mode: "plan",
        model: "gpt-5",
      })
    ).toEqual([
      "--print",
      "--output-format",
      "stream-json",
      "--auto-review",
      "--approve-mcps",
      "--sandbox",
      "enabled",
      "--mode",
      "plan",
      "--model",
      "gpt-5",
      "--resume",
      "chat-123",
      "review this",
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

    expect(buildGeminiLaunchOptions(true)).toEqual({
      approvalMode: "yolo",
      skipTrust: true,
    });
    expect(buildGeminiLaunchOptions(false)).toEqual({
      approvalMode: "default",
      skipTrust: true,
    });

    expect(
      buildGeminiArgs("policy check", {
        resumeId: "gemini-1",
        approvalMode: "default",
        skipTrust: true,
        policyPaths: ["/tmp/user-policy.toml"],
        adminPolicyPaths: ["/tmp/admin-policy.toml"],
        includeDirectories: ["/repo/shared"],
        sandbox: true,
        model: "gemini-2.5-pro",
      })
    ).toEqual([
      "--prompt",
      "policy check",
      "--output-format",
      "stream-json",
      "--approval-mode",
      "default",
      "--skip-trust",
      "--model",
      "gemini-2.5-pro",
      "--sandbox",
      "true",
      "--policy",
      "/tmp/user-policy.toml",
      "--admin-policy",
      "/tmp/admin-policy.toml",
      "--include-directories",
      "/repo/shared",
      "--resume",
      "gemini-1",
    ]);
  });
});
