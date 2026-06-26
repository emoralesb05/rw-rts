import {
  spawnClaudeAgent,
  resumeClaudeSession,
  listAgents as listClaudeAgents,
  getAgent as getClaudeAgent,
} from "./adapters/claude-cli";
import {
  spawnCursorAgent,
  resumeCursorSession,
  listCursorAgents,
  getCursorAgent,
} from "./adapters/cursor-cli";
import {
  spawnCodexAgent,
  resumeCodexSession,
  listCodexAgents,
  getCodexAgent,
} from "./adapters/codex-cli";
import {
  spawnGeminiAgent,
  resumeGeminiSession,
  listGeminiAgents,
  getGeminiAgent,
} from "./adapters/gemini-cli";

export type SpawnableTool = "claude" | "cursor" | "codex" | "gemini";

type AnyAgent = {
  unitId: string;
  sessionId: string;
  cwd: string;
  send(prompt: string): void;
  kill(): void;
};

async function spawn(
  tool: SpawnableTool,
  opts: { prompt: string; cwd: string }
): Promise<AnyAgent> {
  if (tool === "cursor") return spawnCursorAgent(opts);
  if (tool === "codex") return spawnCodexAgent(opts);
  if (tool === "gemini") return spawnGeminiAgent(opts);
  return spawnClaudeAgent(opts);
}

function get(unitId: string): AnyAgent | undefined {
  return (
    getClaudeAgent(unitId) ??
    getCursorAgent(unitId) ??
    getCodexAgent(unitId) ??
    getGeminiAgent(unitId)
  );
}

function list(): AnyAgent[] {
  return [
    ...listClaudeAgents(),
    ...listCursorAgents(),
    ...listCodexAgents(),
    ...listGeminiAgents(),
  ];
}

function sendToObserved(
  unit: { sessionId: string; tool: SpawnableTool; cwd: string },
  prompt: string
) {
  const opts = { sessionId: unit.sessionId, cwd: unit.cwd, prompt };
  if (unit.tool === "cursor") {
    resumeCursorSession(opts);
    return;
  }
  if (unit.tool === "codex") {
    resumeCodexSession(opts);
    return;
  }
  if (unit.tool === "gemini") {
    resumeGeminiSession(opts);
    return;
  }
  resumeClaudeSession(opts);
}

export const AgentManager = {
  spawn,
  list,
  get,
  sendToObserved,
  send(unitId: string, prompt: string) {
    const agent = get(unitId);
    if (!agent) throw new Error(`Unknown unit ${unitId}`);
    agent.send(prompt);
  },
  kill(unitId: string) {
    get(unitId)?.kill();
  },
  killAll() {
    for (const a of list()) a.kill();
  },
};
