import { describe, expect, it } from "vitest";
import {
  AgentEventSchema,
  ClaudeSettingsSchema,
  CodexThreadStartedSchema,
  CursorHooksFileSchema,
  GeminiInitMessageSchema,
  GeminiSettingsSchema,
  HooksStatusSchema,
  HookPayloadSchema,
  ListUnitsResponseSchema,
  ListWorkspaceReposResponseSchema,
  MutedSessionIdsSchema,
  NotificationSettingsSchema,
  OpenPathResponseSchema,
  PermissionOptionSchema,
  PersistedStateSchema,
  ResolvePermissionResponseSchema,
  ResolvePermissionRequestSchema,
  SendPromptRequestSchema,
  SpawnAgentRequestSchema,
  SpawnAgentResponseSchema,
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
    ).toMatchObject({ hooks: expect.any(Object) });
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
      HooksStatusSchema.parse({
        installed: true,
        socketPath: "/tmp/realmkeeper.sock",
        hookScriptPath: "/repo/dist/realmkeeper-hook",
        hooksConfigPath: "/home/user/.cursor/hooks.json",
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
