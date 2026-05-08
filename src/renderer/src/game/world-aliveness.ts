import type { AgentEvent } from "@shared/events";
import type { WorldTheme } from "./gummi-worlds";

export type WorldActivityKind =
  | "shell"
  | "read"
  | "edit"
  | "search"
  | "web"
  | "permission"
  | "error"
  | "success"
  | "subagent"
  | "prompt"
  | "generic";

const SHELL_TOOLS = [
  "bash",
  "bashoutput",
  "shell",
  "exec",
  "terminal",
  "runterminal",
  "runterminalcommand",
  "runterminalcommandv2",
  "run_shell_command",
  "run_terminal_command",
  "run_terminal_command_v2",
];

const READ_TOOLS = [
  "read",
  "openfile",
  "open_file",
  "cat",
  "view",
  "ls",
  "list",
  "listdirectory",
  "list_directory",
];

const EDIT_TOOLS = [
  "edit",
  "write",
  "multiedit",
  "notebookedit",
  "applypatch",
  "apply_patch",
  "searchreplace",
  "search_replace",
  "multiapply",
  "multi_apply",
  "editfile",
  "edit_file",
  "createfile",
  "create_file",
];

const WEB_TOOLS = [
  "webfetch",
  "web_fetch",
  "websearch",
  "web_search",
  "fetch",
  "browser",
  "openurl",
  "open_url",
];

const SEARCH_TOOLS = [
  "grep",
  "glob",
  "rg",
  "search",
  "codesearch",
  "code_search",
  "codebasesearch",
  "codebase_search",
  "file_search",
];

const SUBAGENT_TOOLS = [
  "task",
  "agent",
  "taskv2",
  "task_v2",
  "invokeagent",
  "invoke_agent",
  "invokesubagent",
  "invoke_subagent",
];

const ACTIVITY_LABEL: Record<WorldActivityKind, string> = {
  shell: "$",
  read: "read",
  edit: "edit",
  search: "scan",
  web: "web",
  permission: "ask",
  error: "!",
  success: "ok",
  subagent: "task",
  prompt: ">",
  generic: "*",
};

const BASE_ACTIVITY_COLOR: Record<WorldActivityKind, number> = {
  shell: 0x7af0c0,
  read: 0xcfd9f0,
  edit: 0xffd86b,
  search: 0x6cc6ff,
  web: 0x6cc6ff,
  permission: 0xffb86c,
  error: 0xff5a3c,
  success: 0x7af0c0,
  subagent: 0xffd86b,
  prompt: 0xc9a4ff,
  generic: 0xe6ecff,
};

const THEME_COLOR_OVERRIDES: Partial<
  Record<WorldTheme, Partial<Record<WorldActivityKind, number>>>
> = {
  destiny: {
    web: 0x6cd5ff,
    search: 0xb3e0ff,
    shell: 0x7af0c0,
    error: 0xff6b8a,
  },
  hollow: {
    permission: 0xc9a4ff,
    subagent: 0xe6d8ff,
    search: 0xb88cff,
    error: 0xff5a3c,
  },
  halloween: {
    shell: 0xffb86c,
    edit: 0xff7a4a,
    error: 0xff5a3c,
  },
  twilight: {
    edit: 0xff89a3,
    prompt: 0xffb86c,
    subagent: 0xffd86b,
  },
  disney: {
    success: 0xffd86b,
    edit: 0xffd86b,
  },
  traverse: {
    shell: 0xffb86c,
    web: 0xffd86b,
  },
};

function normalizedToolName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function matchesTool(name: string, candidates: string[]): boolean {
  return candidates.some((candidate) => name.includes(candidate));
}

function toolResultLooksFailed(event: AgentEvent): boolean {
  const payload = event.payload as Record<string, unknown>;
  if (
    typeof payload.error === "string" ||
    payload.resolution === "error" ||
    payload.is_error === true ||
    payload.isError === true
  ) {
    return true;
  }

  const output = payload.output;
  if (typeof output === "string") {
    const head = output.trimStart().slice(0, 80).toLowerCase();
    return head.startsWith("<tool_use_error>") || head.startsWith("<error>");
  }

  if (output && typeof output === "object") {
    const outputRecord = output as Record<string, unknown>;
    return (
      outputRecord.is_error === true ||
      outputRecord.isError === true ||
      typeof outputRecord.error === "string"
    );
  }

  return false;
}

export function activityForToolName(toolName: string): WorldActivityKind {
  const name = normalizedToolName(toolName);
  if (!name) return "generic";
  if (matchesTool(name, SUBAGENT_TOOLS)) return "subagent";
  if (matchesTool(name, WEB_TOOLS)) return "web";
  if (matchesTool(name, EDIT_TOOLS)) return "edit";
  if (matchesTool(name, SEARCH_TOOLS)) return "search";
  if (matchesTool(name, READ_TOOLS)) return "read";
  if (matchesTool(name, SHELL_TOOLS)) return "shell";
  return "generic";
}

export function activityForEvent(event: AgentEvent): WorldActivityKind | null {
  switch (event.kind) {
    case "tool_use":
      return activityForToolName(String(event.payload.name ?? ""));
    case "tool_result":
      return toolResultLooksFailed(event) ? "error" : "success";
    case "permission_request":
      return "permission";
    case "error":
      return "error";
    case "subagent_spawn":
      return "subagent";
    case "user_prompt":
      return "prompt";
    default:
      return null;
  }
}

export function activityColorForTheme(
  theme: WorldTheme,
  kind: WorldActivityKind
): number {
  return THEME_COLOR_OVERRIDES[theme]?.[kind] ?? BASE_ACTIVITY_COLOR[kind];
}

export function activityLabel(kind: WorldActivityKind): string {
  return ACTIVITY_LABEL[kind];
}
