import { describe, expect, it } from "vitest";
import { normalizeClaudeProviderSessions } from "./provider-sessions";

describe("provider session discovery", () => {
  it("normalizes Claude native agent rows", () => {
    expect(
      normalizeClaudeProviderSessions([
        {
          sessionId: "claude-background-1",
          name: "Review worker",
          cwd: "/repo",
          status: "busy",
          kind: "background",
          startedAt: 1_000,
          pid: 42,
        },
        {
          sessionId: "claude-interactive-1",
          status: "idle",
          kind: "interactive",
        },
        {
          name: "missing session id",
        },
      ])
    ).toEqual([
      {
        providerSessionId: "claude-background-1",
        tool: "claude",
        displayName: "Review worker",
        cwd: "/repo",
        status: "busy",
        source: "background",
        createdAt: 1_000,
        pid: 42,
        availableActions: ["resume", "attach", "logs", "stop", "respawn"],
      },
      {
        providerSessionId: "claude-interactive-1",
        tool: "claude",
        displayName: "claude-interactive-1",
        status: "idle",
        source: "interactive",
        availableActions: ["resume", "attach", "logs"],
      },
    ]);
  });

  it("drops malformed Claude output", () => {
    expect(normalizeClaudeProviderSessions({ agents: [] })).toEqual([]);
    expect(normalizeClaudeProviderSessions(null)).toEqual([]);
  });
});
