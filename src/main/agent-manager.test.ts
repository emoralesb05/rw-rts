import { afterEach, describe, expect, it, vi } from "vitest";

async function importManagerWithMocks() {
  const resumeClaudeSession = vi.fn();
  const resumeCursorSession = vi.fn();
  const resumeCodexSession = vi.fn();
  const resumeGeminiSession = vi.fn();

  vi.doMock("./adapters/claude-cli", () => ({
    spawnClaudeAgent: vi.fn(),
    resumeClaudeSession,
    listAgents: () => [],
    getAgent: () => undefined,
  }));
  vi.doMock("./adapters/cursor-cli", () => ({
    spawnCursorAgent: vi.fn(),
    resumeCursorSession,
    listCursorAgents: () => [],
    getCursorAgent: () => undefined,
  }));
  vi.doMock("./adapters/codex-cli", () => ({
    spawnCodexAgent: vi.fn(),
    resumeCodexSession,
    listCodexAgents: () => [],
    getCodexAgent: () => undefined,
  }));
  vi.doMock("./adapters/gemini-cli", () => ({
    spawnGeminiAgent: vi.fn(),
    resumeGeminiSession,
    listGeminiAgents: () => [],
    getGeminiAgent: () => undefined,
  }));

  const { AgentManager } = await import("./agent-manager");
  return {
    AgentManager,
    resumeClaudeSession,
    resumeCursorSession,
    resumeCodexSession,
    resumeGeminiSession,
  };
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("AgentManager", () => {
  it("routes observed sends to the matching provider resume function", async () => {
    const {
      AgentManager,
      resumeClaudeSession,
      resumeCursorSession,
      resumeCodexSession,
      resumeGeminiSession,
    } = await importManagerWithMocks();

    AgentManager.sendToObserved(
      { sessionId: "claude-1", tool: "claude", cwd: "/repo" },
      "continue"
    );
    AgentManager.sendToObserved(
      { sessionId: "cursor-chat-1", tool: "cursor", cwd: "/repo" },
      "continue"
    );
    AgentManager.sendToObserved(
      { sessionId: "codex-1", tool: "codex", cwd: "/repo" },
      "continue"
    );
    AgentManager.sendToObserved(
      { sessionId: "gemini-1", tool: "gemini", cwd: "/repo" },
      "continue"
    );

    expect(resumeClaudeSession).toHaveBeenCalledWith({
      sessionId: "claude-1",
      cwd: "/repo",
      prompt: "continue",
    });
    expect(resumeCursorSession).toHaveBeenCalledWith({
      sessionId: "cursor-chat-1",
      cwd: "/repo",
      prompt: "continue",
    });
    expect(resumeCodexSession).toHaveBeenCalledWith({
      sessionId: "codex-1",
      cwd: "/repo",
      prompt: "continue",
    });
    expect(resumeGeminiSession).toHaveBeenCalledWith({
      sessionId: "gemini-1",
      cwd: "/repo",
      prompt: "continue",
    });
  });

  it("throws for unknown spawned unit sends", async () => {
    const { AgentManager } = await importManagerWithMocks();

    expect(() => AgentManager.send("missing", "hello")).toThrow(
      "Unknown unit missing"
    );
  });
});
