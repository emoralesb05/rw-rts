const TOOL_MP_BASE: Record<string, number> = {
  Read: 2,
  Glob: 2,
  Grep: 2,
  TodoWrite: 1,
  Bash: 6,
  BashOutput: 4,
  Edit: 5,
  MultiEdit: 7,
  Write: 5,
  NotebookEdit: 5,
  Task: 12,
  Agent: 12,
  WebFetch: 6,
  WebSearch: 6,
};

export function mpCostForToolUse(toolName: string): number {
  return TOOL_MP_BASE[toolName] ?? 4;
}

export function mpCostForToolResult(output: unknown): number {
  let len = 0;
  if (typeof output === "string") len = output.length;
  else if (output && typeof output === "object") {
    const r = output as Record<string, unknown>;
    if (typeof r.stdout === "string") len = r.stdout.length;
    else if (typeof r.text === "string") len = r.text.length;
    else if (typeof r.content === "string") len = r.content.length;
  }
  if (len < 1000) return 0;
  return Math.min(8, Math.floor(len / 5000));
}
