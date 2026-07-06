import { describe, expect, it } from "vitest";
import {
  AgentEventSchema,
  ClaudeSettingsSchema,
  CodexThreadStartedSchema,
  ControlSessionRequestSchema,
  ControlSessionResponseSchema,
  ControlOrchestrationRunRequestSchema,
  CreateOrchestrationRunRequestSchema,
  CursorHooksFileSchema,
  FixtureScenarioSchema,
  GeminiInitMessageSchema,
  GeminiSettingsSchema,
  HooksStatusSchema,
  HookPayloadSchema,
  KillAgentRequestSchema,
  ListProviderSessionsRequestSchema,
  ListProviderSessionsResponseSchema,
  ListUnitsResponseSchema,
  ListOrchestrationRunsResponseSchema,
  ListWorkspaceReposResponseSchema,
  MutedSessionIdsSchema,
  NotificationSettingsSchema,
  OpenPathResponseSchema,
  OrchestrationRunResponseSchema,
  PermissionOptionSchema,
  PersistedStateSchema,
  ResolvePermissionResponseSchema,
  ResolvePermissionRequestSchema,
  SendPromptRequestSchema,
  SpawnAgentRequestSchema,
  SpawnAgentResponseSchema,
  VoidResponseSchema,
  WorkspaceRootValidationSchema,
  parseProviderStreamMessage,
} from "./schemas";

describe("runtime schemas", () => {
  it("accepts a valid spawn request", () => {
    expect(
      SpawnAgentRequestSchema.parse({
        prompt: "summarize this repo",
        cwd: "/repo",
        tool: "gemini",
      })
    ).toEqual({
      prompt: "summarize this repo",
      cwd: "/repo",
      tool: "gemini",
    });
  });

  it("rejects unknown provider tools before spawn", () => {
    expect(() =>
      SpawnAgentRequestSchema.parse({
        prompt: "run",
        cwd: "/repo",
        tool: "unknown",
      })
    ).toThrow();
  });

  it("accepts typed session-control requests and responses", () => {
    expect(
      ControlSessionRequestSchema.parse({
        action: "send",
        unitId: "unit-1",
        sessionId: "session-1",
        tool: "codex",
        cwd: "/repo",
        status: "working",
        activeTurnKnown: true,
        prompt: "continue",
      })
    ).toMatchObject({
      action: "send",
      tool: "codex",
      prompt: "continue",
    });

    expect(
      ControlSessionResponseSchema.parse({
        action: "interrupt",
        ok: false,
        unitId: "unit-2",
        sessionId: "session-2",
        reason: "not available",
      })
    ).toEqual({
      action: "interrupt",
      ok: false,
      unitId: "unit-2",
      sessionId: "session-2",
      reason: "not available",
    });
  });

  it("rejects malformed session-control requests", () => {
    expect(() =>
      ControlSessionRequestSchema.parse({
        action: "explode",
        unitId: "unit-1",
        tool: "claude",
      })
    ).toThrow();
    expect(() =>
      ControlSessionRequestSchema.parse({
        action: "issueDecree",
        unitId: "unit-1",
        tool: "claude",
      })
    ).toThrow();
    expect(() =>
      ControlSessionRequestSchema.parse({
        action: "send",
        unitId: "unit-1",
        tool: "unknown",
      })
    ).toThrow();
  });

  it("accepts typed orchestration run IPC contracts", () => {
    expect(
      CreateOrchestrationRunRequestSchema.parse({
        template: "standing-order",
        title: "Keep going",
        cwd: "/repo",
        budget: { maxIterations: 3 },
        status: "queued",
      })
    ).toMatchObject({
      template: "standing-order",
      budget: { maxIterations: 3 },
    });

    expect(
      ControlOrchestrationRunRequestSchema.parse({
        runId: "run-1",
        action: "pause",
        reason: "Need approval.",
      })
    ).toMatchObject({
      runId: "run-1",
      action: "pause",
    });

    const run = OrchestrationRunResponseSchema.parse({
      id: "run-1",
      template: "standing-order",
      title: "Keep going",
      status: "queued",
      createdAt: 1,
      updatedAt: 1,
      providerSessions: [],
      traceIds: [],
      permissionRequestIds: [],
      userInputRequestIds: [],
      steps: [],
      checkpoints: [],
      budget: {},
      events: [],
    });
    expect(ListOrchestrationRunsResponseSchema.parse([run])).toHaveLength(1);
  });

  it("requires a concrete permission request id", () => {
    expect(() =>
      ResolvePermissionRequestSchema.parse({
        requestId: "",
        decision: "allow",
      })
    ).toThrow();
  });

  it("accepts provider permission options and selected option ids", () => {
    expect(
      PermissionOptionSchema.parse({
        id: "allow-once",
        label: "allow",
        decision: "allow",
        variant: "primary",
      })
    ).toMatchObject({ decision: "allow" });

    expect(
      ResolvePermissionRequestSchema.parse({
        requestId: "req-1",
        decision: "deny",
        optionId: "deny",
        message: "not safe",
      })
    ).toMatchObject({ optionId: "deny" });
  });

  it("accepts answer-letter fixture scenarios", () => {
    expect(FixtureScenarioSchema.parse("codex-inputs")).toBe("codex-inputs");
    expect(FixtureScenarioSchema.parse("codex-decline-only-inputs")).toBe(
      "codex-decline-only-inputs"
    );
    expect(FixtureScenarioSchema.parse("claude-question")).toBe(
      "claude-question"
    );
    expect(FixtureScenarioSchema.parse("permission-cursor")).toBe(
      "permission-cursor"
    );
  });

  it("rejects corrupt persisted state counters", () => {
    expect(() =>
      PersistedStateSchema.parse({
        schemaVersion: 2,
        kingdomFoundedAt: Date.now(),
        totalGlimmerEver: 0,
        wielders: {
          "claude::/repo": {
            tool: "claude",
            repoRoot: "/repo",
            visits: -1,
            seals: 0,
            falls: 0,
            totalGlimmer: 0,
            lastSeen: Date.now(),
          },
        },
        worlds: {},
        standingOrders: [],
      })
    ).toThrow();
  });

  it("accepts a valid agent event envelope", () => {
    expect(
      AgentEventSchema.parse({
        sessionId: "s1",
        tool: "claude",
        cwd: "/repo",
        timestamp: 1,
        kind: "tool_use",
        payload: {
          name: "Bash",
          input: { command: "git status" },
        },
        source: "hook",
      })
    ).toMatchObject({
      sessionId: "s1",
      tool: "claude",
      kind: "tool_use",
    });
  });

  it("accepts Realmkeeper session-control events", () => {
    expect(
      AgentEventSchema.parse({
        sessionId: "s1",
        tool: "codex",
        cwd: "/repo",
        timestamp: 1,
        kind: "session_control",
        payload: {
          controlAction: "interrupt",
          ok: false,
          reason: "Codex has no active turn to interrupt right now.",
          reasonCode: "capability_unavailable",
        },
        source: "realmkeeper",
      })
    ).toMatchObject({
      kind: "session_control",
      payload: {
        controlAction: "interrupt",
        ok: false,
        reason: "Codex has no active turn to interrupt right now.",
        reasonCode: "capability_unavailable",
      },
    });
  });

  it("accepts Realmkeeper orchestration lifecycle events", () => {
    expect(
      AgentEventSchema.parse({
        sessionId: "s1",
        tool: "codex",
        cwd: "/repo",
        timestamp: 1,
        kind: "orchestration_event",
        payload: {
          orchestrationRunId: "run-1",
          orchestrationRunTitle: "Keep tests moving",
          orchestrationRunStatus: "running",
          orchestrationTemplate: "standing-order",
          orchestrationEventKind: "checkpoint",
          stepId: "step-1",
          checkpointId: "checkpoint-1",
          text: "Iteration sent",
        },
        source: "realmkeeper",
      })
    ).toMatchObject({
      kind: "orchestration_event",
      payload: {
        orchestrationRunId: "run-1",
        orchestrationEventKind: "checkpoint",
      },
    });
  });

  it("accepts Cursor provider identity diagnostics on event payloads", () => {
    expect(
      AgentEventSchema.parse({
        sessionId: "cursor-chat-1",
        tool: "cursor",
        cwd: "/repo",
        timestamp: 1,
        kind: "assistant_text",
        payload: {
          text: "done",
          cursorChatId: "chat-1",
          providerConversationId: "chat-1",
          providerSessionId: "process-1",
        },
        source: "hook",
      })
    ).toMatchObject({
      payload: {
        cursorChatId: "chat-1",
        providerSessionId: "process-1",
      },
    });
  });

  it("accepts Codex app-server diagnostics on event payloads", () => {
    expect(
      AgentEventSchema.parse({
        sessionId: "codex-thread",
        tool: "codex",
        cwd: "/repo",
        timestamp: 1,
        kind: "error",
        payload: {
          error: "unsupported request",
          codexAppServer: {
            status: "turn-started",
            threadId: "thread-1",
            activeTurnId: "turn-1",
            approvalPolicy: "never",
            sandbox: "workspace-write",
            unsupportedRequestCount: 1,
          },
        },
        source: "spawned",
      })
    ).toMatchObject({
      payload: {
        codexAppServer: {
          threadId: "thread-1",
          unsupportedRequestCount: 1,
        },
      },
    });
  });

  it("accepts Realmkeeper-originated prompts for observed sessions", () => {
    expect(
      AgentEventSchema.parse({
        sessionId: "s1",
        tool: "claude",
        cwd: "/repo",
        timestamp: 1,
        kind: "user_prompt",
        payload: { text: "continue" },
        source: "realmkeeper",
      })
    ).toMatchObject({
      kind: "user_prompt",
      source: "realmkeeper",
    });
  });

  it("rejects malformed agent event envelopes", () => {
    expect(() =>
      AgentEventSchema.parse({
        sessionId: "s1",
        tool: "claude",
        cwd: "/repo",
        timestamp: 1,
        kind: "tool_use",
        payload: {},
        source: "fixture",
      })
    ).toThrow();
  });

  it("accepts loose hook payloads with required event names", () => {
    expect(
      HookPayloadSchema.parse({
        hook_event_name: "BeforeTool",
        __rw_tool: "gemini",
        future_provider_field: { ok: true },
      })
    ).toMatchObject({
      hook_event_name: "BeforeTool",
      __rw_tool: "gemini",
    });
  });

  it("rejects hook payloads without event names", () => {
    expect(() => HookPayloadSchema.parse({ session_id: "s1" })).toThrow();
  });

  it("accepts provider installer config JSON shapes", () => {
    expect(
      ClaudeSettingsSchema.parse({
        hooks: {
          PreToolUse: [
            {
              matcher: "*",
              hooks: [{ type: "command", command: "/x/realmkeeper-hook" }],
            },
          ],
        },
      })
    ).toMatchObject({ hooks: expect.any(Object) });

    expect(
      CursorHooksFileSchema.parse({
        version: 1,
        hooks: {
          preToolUse: [{ command: "/x/realmkeeper-hook", timeout: 30 }],
        },
      })
    ).toMatchObject({ version: 1 });

    expect(
      GeminiSettingsSchema.parse({
        security: {
          auth: {
            selectedType: "oauth-personal",
          },
        },
        hooks: {
          BeforeTool: [
            {
              matcher: "*",
              hooks: [
                {
                  type: "command",
                  name: "realmkeeper",
                  command: "/x/realmkeeper-hook --tool gemini",
                  timeout: 600000,
                },
              ],
            },
          ],
        },
      })
    ).toMatchObject({
      hooks: expect.any(Object),
      security: { auth: { selectedType: "oauth-personal" } },
    });
  });

  it("parses provider JSONL only when the line is a JSON object", () => {
    expect(parseProviderStreamMessage("plain banner line")).toBeNull();
    expect(parseProviderStreamMessage("null")).toBeNull();
    expect(
      parseProviderStreamMessage('{"type":"item.completed"}')
    ).toMatchObject({
      type: "item.completed",
    });
  });

  it("validates provider stream session handshakes", () => {
    expect(
      CodexThreadStartedSchema.parse({
        type: "thread.started",
        thread_id: "thread-1",
      })
    ).toMatchObject({ thread_id: "thread-1" });

    expect(
      GeminiInitMessageSchema.parse({
        type: "init",
        session_id: "gemini-1",
      })
    ).toMatchObject({ session_id: "gemini-1" });

    expect(() =>
      CodexThreadStartedSchema.parse({
        type: "thread.started",
        thread_id: "",
      })
    ).toThrow();
  });

  it("validates renderer-local storage contracts", () => {
    expect(MutedSessionIdsSchema.parse(["s1", "s2"])).toEqual(["s1", "s2"]);
    expect(() => MutedSessionIdsSchema.parse(["s1", ""])).toThrow();

    expect(
      NotificationSettingsSchema.parse({
        enabled: true,
        fireCritical: true,
        fireImportant: false,
        fireNotable: false,
        quietStartHour: 22,
        quietEndHour: 8,
      })
    ).toMatchObject({ quietStartHour: 22 });

    expect(() =>
      NotificationSettingsSchema.parse({
        enabled: true,
        fireCritical: true,
        fireImportant: false,
        fireNotable: false,
        quietStartHour: 24,
        quietEndHour: 8,
      })
    ).toThrow();
  });

  it("validates IPC response contracts exposed through preload", () => {
    expect(
      SendPromptRequestSchema.parse({
        unitId: "unit-1",
        sessionId: "session-1",
        tool: "gemini",
        cwd: "/repo",
        prompt: "continue",
      })
    ).toMatchObject({ tool: "gemini" });

    expect(KillAgentRequestSchema.parse("unit-1")).toBe("unit-1");
    expect(VoidResponseSchema.parse(undefined)).toBeUndefined();

    expect(
      SpawnAgentResponseSchema.parse({
        unitId: "unit-1",
        sessionId: "session-1",
      })
    ).toMatchObject({ unitId: "unit-1" });

    expect(
      ListUnitsResponseSchema.parse([
        { unitId: "unit-1", sessionId: "session-1", cwd: "/repo" },
      ])
    ).toHaveLength(1);

    expect(
      ListProviderSessionsRequestSchema.parse({
        tools: ["claude", "codex"],
        cwd: "/repo",
      })
    ).toMatchObject({ tools: ["claude", "codex"] });

    expect(
      ListProviderSessionsResponseSchema.parse({
        generatedAt: 1,
        sessions: [
          {
            providerSessionId: "thread-1",
            tool: "codex",
            displayName: "Inspect tests",
            cwd: "/repo",
            status: "active",
            source: "cli",
            createdAt: 1,
            updatedAt: 2,
            modelProvider: "openai",
            availableActions: ["resume", "fork"],
          },
        ],
        errors: [
          {
            tool: "cursor",
            reasonCode: "not_implemented",
            message: "Cursor provider-session discovery is not wired yet.",
          },
        ],
      }).sessions
    ).toHaveLength(1);

    expect(
      HooksStatusSchema.parse({
        installed: true,
        socketPath: "/tmp/realmkeeper.sock",
        hookScriptPath: "/repo/dist/realmkeeper-hook",
        hooksConfigPath: "/home/user/.cursor/hooks.json",
        cliVersion: "2.1.193 (Claude Code)",
        transcriptWatcherPath: "/home/user/.claude/projects",
        transcriptWatcherPollMs: 2000,
        richStreamFlags: {
          includeHookEvents: false,
          includePartialMessages: false,
          promptSuggestions: false,
        },
        sessionDiagnostics: {
          listSessionsAvailable: true,
          sessionCount: 0,
        },
        authStatus: {
          loggedIn: true,
          authMethod: "claude.ai",
          apiProvider: "firstParty",
          subscriptionType: "max",
        },
        authIssue: {
          code: "gemini-oauth-headless-unverified",
          severity: "info",
          message: "OAuth headless support needs validation",
          action: "Confirm Google sign-in or use API key or Vertex",
        },
        settingsTemplate: '{\n  "hooksConfig": { "enabled": true }\n}',
      })
    ).toMatchObject({ installed: true });

    expect(OpenPathResponseSchema.parse("")).toBe("");
    expect(ResolvePermissionResponseSchema.parse(true)).toBe(true);
  });

  it("rejects malformed IPC response payloads", () => {
    expect(() =>
      SpawnAgentResponseSchema.parse({
        unitId: "",
        sessionId: "session-1",
      })
    ).toThrow();

    expect(() => KillAgentRequestSchema.parse("")).toThrow();
    expect(() => VoidResponseSchema.parse(null)).toThrow();

    expect(() =>
      HooksStatusSchema.parse({
        installed: true,
        socketPath: "/tmp/realmkeeper.sock",
      })
    ).toThrow();

    expect(() =>
      WorkspaceRootValidationSchema.parse({
        valid: false,
        expanded: "/missing",
        reason: "permission-denied",
      })
    ).toThrow();
  });

  it("validates workspace IPC response shapes", () => {
    expect(
      ListWorkspaceReposResponseSchema.parse([
        { path: "/repo", label: "repo" },
        { path: "/repo/packages/app", label: "app" },
      ])
    ).toHaveLength(2);

    expect(
      WorkspaceRootValidationSchema.parse({
        valid: false,
        expanded: "",
        reason: "empty",
      })
    ).toMatchObject({ reason: "empty" });
  });
});
