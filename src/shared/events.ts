export type AgentTool = "claude" | "cursor" | "codex";

export type UnitRole =
  // Claude — Keyblade Wielders + Royal Court
  | "sora"
  | "riku"
  | "kairi"
  | "donald"
  | "goofy"
  | "mickey"
  // Cursor — BBS / Days / Re:CoM
  | "ventus"
  | "aqua"
  | "terra"
  | "roxas"
  | "namine"
  // Codex — FF guests in KH
  | "cloud"
  | "leon"
  | "tifa"
  | "aerith"
  | "yuffie"
  // Generic faction fallbacks (kept for compatibility)
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
  // Repo root for cwd — stamped by the main-process event bus before emit.
  // The renderer keys worlds by this, so any subdir of the same repo lands
  // on the same KH world. Falls back to cwd when no repo root is found.
  repoRoot?: string;
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

export type DriveForm = "valor" | "wisdom" | "final";

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
  parentSessionId?: string;
  driveForm?: DriveForm;
  driveFormUntil?: number;
};

export type HeartlessType = "shadow" | "soldier" | "large_body";

export type Heartless = {
  id: string;
  type: HeartlessType;
  worldId: string;
  targetUnitId?: string;
  hp: number;
  spawnedAt: number;
};

export type WorldAlertLevel =
  | "idle"
  | "active"
  | "warning"
  | "danger"
  | "cleared";

export type WorldState = {
  id: string;
  path: string;
  label: string;
  unitIds: string[];
  heartless: Heartless[];
  alertLevel: WorldAlertLevel;
  munny: number;
};

type ToolNameRoleMap = Record<string, UnitRole>;

const CLAUDE_ROSTER: ToolNameRoleMap = {
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
  // Mickey is promoted via the subagent-end path in store.ts, not via
  // tool-name mapping (hook event names never reach lastToolName).
};

// Cursor's tools (read_file_v2, glob_file_search, run_terminal_command_v2,
// task_v2, etc.) map to BBS / Days / Re:CoM cast.
const CURSOR_ROSTER: ToolNameRoleMap = {
  edit_file: "aqua",
  search_replace: "aqua",
  multi_apply: "aqua",
  read_file_v2: "ventus",
  read_file: "ventus",
  glob_file_search: "ventus",
  ripgrep_raw_search: "ventus",
  semantic_search: "ventus",
  run_terminal_command_v2: "terra",
  run_terminal_command: "terra",
  fetch_pull_request: "roxas",
  web_search: "roxas",
  task_v2: "namine",
  update_current_step: "namine",
};

// Codex's tools (function_call.name + custom tools) → FF guests.
const CODEX_ROSTER: ToolNameRoleMap = {
  apply_patch: "cloud",
  edit: "cloud",
  write: "cloud",
  shell: "leon",
  Bash: "leon",
  exec: "leon",
  read: "aerith",
  view: "aerith",
  find: "yuffie",
  search: "yuffie",
  grep: "yuffie",
  task: "tifa",
};

export const ROLE_BY_TOOL: Record<AgentTool, ToolNameRoleMap> = {
  claude: CLAUDE_ROSTER,
  cursor: CURSOR_ROSTER,
  codex: CODEX_ROSTER,
};

export const ROLE_FALLBACK: Record<AgentTool, UnitRole> = {
  claude: "sora",
  cursor: "ventus",
  codex: "cloud",
};

// Backwards compat alias for any callers still using the flat map.
export const ROLE_BY_TOOL_NAME: ToolNameRoleMap = {
  ...CLAUDE_ROSTER,
  ...CURSOR_ROSTER,
  ...CODEX_ROSTER,
};
