import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPermissionChoiceRequest,
  cancelPermissionRequest,
  pendingPermissionCount,
  registerPermissionRequest,
  registerPermissionRequestWithRules,
  resolvePermissionRequest,
} from "./hook-bridge";
import {
  claudeAskUserQuestionUpdatedInput,
  normalizeHookPayload,
} from "./hook-normalizer";
import {
  cancelUserInputRequest,
  pendingUserInputCount,
  registerUserInputRequest,
  resolveUserInputRequest,
} from "./user-input-bridge";
import {
  clearPermissionRules,
  listPermissionRules,
  resetPermissionRulesForTests,
  setPermissionRulesFileForTests,
} from "../permission-rules";

let permissionRuleDir = "";

beforeEach(() => {
  permissionRuleDir = mkdtempSync(join(tmpdir(), "realmkeeper-hook-rules-"));
  setPermissionRulesFileForTests(join(permissionRuleDir, "permissions.json"));
  clearPermissionRules();
});

afterEach(() => {
  clearPermissionRules();
  resetPermissionRulesForTests();
  if (permissionRuleDir) {
    rmSync(permissionRuleDir, { recursive: true, force: true });
  }
});

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

  it("normalizes Claude AskUserQuestion as an answerable request", () => {
    const event = normalizeHookPayload({
      hook_event_name: "PreToolUse",
      session_id: "claude-session",
      cwd: "/repo",
      tool_name: "AskUserQuestion",
      tool_input: {
        questions: [
          {
            question: "Which implementation should I use?",
            options: [
              { label: "Small", description: "Minimal change." },
              { label: "Broad", description: "Refactor the module." },
            ],
          },
          {
            question: "Which files should I inspect?",
            allow_multiple: true,
            choices: ["tests", "docs"],
          },
        ],
      },
      __rw_user_input_request_id: "question-req-1",
    });

    expect(event).toMatchObject({
      sessionId: "claude-session",
      tool: "claude",
      cwd: "/repo",
      source: "hook",
      kind: "user_input_request",
      payload: {
        name: "AskUserQuestion",
        requestId: "question-req-1",
        text: "Which implementation should I use?",
        questions: [
          {
            id: "question-1",
            header: "Question 1",
            question: "Which implementation should I use?",
            required: true,
            options: [
              {
                label: "Small",
                value: "Small",
                description: "Minimal change.",
              },
              {
                label: "Broad",
                value: "Broad",
                description: "Refactor the module.",
              },
            ],
          },
          {
            id: "question-2",
            header: "Question 2",
            question: "Which files should I inspect?",
            required: true,
            multiSelect: true,
            options: [
              { label: "tests", value: "tests" },
              { label: "docs", value: "docs" },
            ],
          },
        ],
      },
    });

    expect(
      claudeAskUserQuestionUpdatedInput(event?.payload.input, {
        "question-1": { answers: ["Small"] },
        "question-2": { answers: ["tests", "docs"] },
      })
    ).toEqual({
      questions: [
        {
          question: "Which implementation should I use?",
          options: [
            { label: "Small", description: "Minimal change." },
            { label: "Broad", description: "Refactor the module." },
          ],
        },
        {
          question: "Which files should I inspect?",
          allow_multiple: true,
          choices: ["tests", "docs"],
        },
      ],
      answers: {
        "Which implementation should I use?": "Small",
        "Which files should I inspect?": "tests, docs",
      },
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
      session_id: "process-1",
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
        cursorChatId: "chat-1",
        providerConversationId: "chat-1",
        providerSessionId: "process-1",
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
      sessionId: "process-2",
      cwd: "/repo",
      text: "Done.",
    });

    expect(event).toMatchObject({
      sessionId: "cursor-chat-1",
      tool: "cursor",
      cwd: "/repo",
      kind: "assistant_text",
      payload: {
        text: "Done.",
        cursorChatId: "chat-1",
        providerConversationId: "chat-1",
        providerSessionId: "process-2",
      },
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

  it("writes a rule from a rich permission choice and auto-resolves the next match", () => {
    const resolutions: unknown[] = [];
    const options = [
      {
        id: "allow-once",
        label: "allow",
        decision: "allow" as const,
      },
      {
        id: "deny",
        label: "deny",
        decision: "deny" as const,
      },
    ];

    const first = registerPermissionRequestWithRules(
      {
        sessionId: "codex-thread",
        tool: "codex",
        cwd: "/repo",
        source: "spawned",
      },
      "req-rule",
      options,
      (resolution) => {
        resolutions.push(resolution);
      },
      {
        name: "Bash",
        input: { command: "pnpm test" },
        repoRoot: "/repo",
      }
    );

    expect(first.status).toBe("registered");
    expect(
      applyPermissionChoiceRequest("req-rule", "allow-session", undefined)
    ).toBe(true);
    expect(resolutions).toEqual([
      { decision: "allow", optionId: "allow-once", message: undefined },
    ]);
    expect(listPermissionRules()).toHaveLength(1);

    const second = registerPermissionRequestWithRules(
      {
        sessionId: "codex-thread",
        tool: "codex",
        cwd: "/repo",
        source: "spawned",
      },
      "req-rule-2",
      options,
      (resolution) => {
        resolutions.push(resolution);
      },
      {
        name: "Bash",
        input: { command: "pnpm test" },
        repoRoot: "/repo",
      }
    );

    expect(second.status).toBe("auto-resolved");
    expect(resolutions.at(-1)).toEqual({
      decision: "allow",
      optionId: "allow-once",
    });
    expect(pendingPermissionCount()).toBe(0);
  });

  it("resolves callback-backed user input requests", () => {
    let resolved:
      | {
          answers: Record<string, { answers: string[] }>;
        }
      | undefined;

    const registered = registerUserInputRequest(
      {
        sessionId: "claude-session",
        tool: "claude",
        cwd: "/repo",
        source: "hook",
      },
      "question-req-2",
      ({ answers }) => {
        resolved = { answers };
      }
    );

    expect(registered).toBe(true);
    expect(pendingUserInputCount()).toBeGreaterThan(0);
    expect(
      resolveUserInputRequest("question-req-2", {
        "question-1": { answers: ["Small"] },
      })
    ).toBe(true);
    expect(resolved).toEqual({
      answers: {
        "question-1": { answers: ["Small"] },
      },
    });
    expect(cancelUserInputRequest("question-req-2")).toBe(false);
  });
});
