export type AgentTool = "claude" | "cursor" | "codex";

export type UnitRole =
  | "sora"
  | "riku"
  | "kairi"
  | "donald"
  | "goofy"
  | "organization"
  | "unversed";

export type AgentEventKind =
  | "session_start"
  | "session_end"
  | "user_prompt"
  | "assistant_text"
  | "tool_use"
  | "tool_result"
  | "subagent_spawn"
  | "error";

export type AgentEvent = {
  sessionId: string;
  tool: AgentTool;
  cwd: string;
  timestamp: number;
  kind: AgentEventKind;
  payload: {
    name?: string;
    input?: unknown;
    output?: unknown;
    text?: string;
    error?: string;
    parentSessionId?: string;
  };
  source: "spawned" | "hook";
};

export type UnitState = {
  id: string;
  sessionId: string;
  tool: AgentTool;
  role: UnitRole;
  cwd: string;
  worldId: string;
  hp: number;
  mp: number;
  status: "idle" | "working" | "casting" | "moving" | "complete" | "fallen";
  lastActivity: number;
  lastTool?: string;
  spawnedHere: boolean;
};

export type WorldState = {
  id: string;
  path: string;
  label: string;
  unitIds: string[];
};

export const ROLE_BY_TOOL_NAME: Record<string, UnitRole> = {
  Edit: "sora",
  Write: "sora",
  MultiEdit: "sora",
  NotebookEdit: "sora",
  Bash: "riku",
  Read: "goofy",
  Grep: "goofy",
  Glob: "goofy",
  WebFetch: "donald",
  WebSearch: "donald",
  Task: "kairi",
  Agent: "kairi",
  TaskCreate: "kairi",
};
