import {
  spawnClaudeAgent,
  listAgents as listClaudeAgents,
  getAgent as getClaudeAgent,
} from "./adapters/claude-cli";
import {
  spawnCursorAgent,
  listCursorAgents,
  getCursorAgent,
} from "./adapters/cursor-cli";
import {
  spawnCodexAgent,
  listCodexAgents,
  getCodexAgent,
} from "./adapters/codex-cli";

export type SpawnableTool = "claude" | "cursor" | "codex";

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
  return spawnClaudeAgent(opts);
}

function get(unitId: string): AnyAgent | undefined {
  return getClaudeAgent(unitId) ?? getCursorAgent(unitId) ?? getCodexAgent(unitId);
}

function list(): AnyAgent[] {
  return [...listClaudeAgents(), ...listCursorAgents(), ...listCodexAgents()];
}

export const AgentManager = {
  spawn,
  list,
  get,
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
