import { afterEach, describe, expect, it, vi } from "vitest";

async function importManagerWithMocks() {
  const resumeClaudeSession = vi.fn();
  const resumeCursorSession = vi.fn();
  const resumeCodexSession = vi.fn();
  const forkCodexSession = vi.fn(() =>
    Promise.resolve({
      unitId: "codex-fork-1",
      sessionId: "codex-fork-1",
      cwd: "/repo",
      send: vi.fn(),
      interrupt: vi.fn(),
      kill: vi.fn(),
    })
  );
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
    forkCodexSession,
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
    forkCodexSession,
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

  it("routes provider-session forks to Codex", async () => {
    const { AgentManager, forkCodexSession } = await importManagerWithMocks();

    await expect(
      AgentManager.forkProviderSession({
        sessionId: "codex-thread-1",
        tool: "codex",
        cwd: "/repo",
      })
    ).resolves.toMatchObject({
      unitId: "codex-fork-1",
      sessionId: "codex-fork-1",
    });

    expect(forkCodexSession).toHaveBeenCalledWith({
      sessionId: "codex-thread-1",
      cwd: "/repo",
      prompt: undefined,
    });

    await expect(
      AgentManager.forkProviderSession({
        sessionId: "claude-session-1",
        tool: "claude",
        cwd: "/repo",
      })
    ).rejects.toThrow(/not wired/i);
  });

  it("routes interrupts to agents that expose an interrupt control", async () => {
    const interrupt = vi.fn();

    vi.doMock("./adapters/claude-cli", () => ({
      spawnClaudeAgent: vi.fn(),
      resumeClaudeSession: vi.fn(),
      listAgents: () => [],
      getAgent: () => undefined,
    }));
    vi.doMock("./adapters/cursor-cli", () => ({
      spawnCursorAgent: vi.fn(),
      resumeCursorSession: vi.fn(),
      listCursorAgents: () => [],
      getCursorAgent: () => undefined,
    }));
    vi.doMock("./adapters/codex-cli", () => ({
      spawnCodexAgent: vi.fn(),
      forkCodexSession: vi.fn(),
      resumeCodexSession: vi.fn(),
      listCodexAgents: () => [],
      getCodexAgent: () => ({
        unitId: "codex-1",
        sessionId: "codex-1",
        cwd: "/repo",
        send: vi.fn(),
        interrupt,
        kill: vi.fn(),
      }),
    }));
    vi.doMock("./adapters/gemini-cli", () => ({
      spawnGeminiAgent: vi.fn(),
      resumeGeminiSession: vi.fn(),
      listGeminiAgents: () => [],
      getGeminiAgent: () => undefined,
    }));

    const { AgentManager } = await import("./agent-manager");
    AgentManager.interrupt("codex-1");

    expect(interrupt).toHaveBeenCalled();
  });
});
