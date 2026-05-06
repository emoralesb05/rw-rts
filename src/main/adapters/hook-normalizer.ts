import { basename, dirname } from "node:path";
import type { AgentEvent, AgentEventKind } from "@shared/events";
import type { HookPayload } from "@shared/schemas";
import { isSpawnedSession } from "./claude-cli";

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function dedupeHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

// Canonical tool-name registry — the renderer's icon table, summary
// helpers, and per-tool special rendering (terminal blocks, diff
// rendering, etc.) all key on Claude's Bash/Read/Edit/Grep/etc. taxonomy.
// Cursor and Codex emit their own tool names through hooks; map them
// here so a "shell command" looks the same in the chat regardless of
// which CLI ran it. Add to this table when a new tool name appears in
// the bridge log without an icon.
const TOOL_NAME_CANONICAL: Record<string, string> = {
  // Cursor (CamelCase from its hook payloads)
  run_terminal_command: "Bash",
  run_terminal_command_v2: "Bash",
  read_file: "Read",
  list_dir: "Glob",
  edit_file: "Edit",
  write_file: "Write",
  create_file: "Write",
  delete_file: "Bash",
  grep_search: "Grep",
  file_search: "Glob",
  codebase_search: "Grep",
  web_search: "WebSearch",
  fetch_pull_request: "WebFetch",
  // Codex (snake_case via Rust)
  command_execution: "Bash",
  apply_patch: "Edit",
  shell: "Bash",
  // Gemini CLI (read_file / grep_search / write_file shared above)
  invoke_agent: "Agent",
  invoke_subagent: "Agent",
  run_shell_command: "Bash",
  read_many_files: "Read",
  list_directory: "Glob",
  glob: "Glob",
  search_file_content: "Grep",
  replace: "Edit",
  write_todos: "TodoWrite",
  google_web_search: "WebSearch",
  web_fetch: "WebFetch",
};

function canonicalToolName(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  return TOOL_NAME_CANONICAL[raw] ?? raw;
}

function geminiParentSessionFromTranscriptPath(
  transcriptPath: unknown,
  sessionId: string
): string | undefined {
  const path = nonEmptyString(transcriptPath);
  if (!path) return undefined;
  const containingDir = dirname(path);
  const parentDir = basename(containingDir);
  const grandparentDir = basename(dirname(containingDir));
  if (grandparentDir !== "chats") return undefined;
  if (!parentDir || parentDir === "." || parentDir === "chats") return undefined;
  if (parentDir === sessionId) return undefined;
  // Gemini subagent transcripts live under .../chats/<parentSessionId>/<child>.jsonl.
  return parentDir;
}

export function normalizeHookPayload(p: HookPayload): AgentEvent | null {
  const eventName = p?.hook_event_name as string | undefined;
  if (!eventName) return null;
  // Cursor uses camelCase event names (sessionStart, beforeShellExecution,
  // preToolUse, ...); Claude/Codex use PascalCase (SessionStart, PreToolUse,
  // PermissionRequest, ...). PascalCase + the optional __kh_tool marker
  // dispatch onwards — Codex's payload shape is identical to Claude's
  // (same field names, same PermissionRequest output schema), so the
  // marker is the only way to attribute correctly.
  if (eventName[0] === eventName[0].toLowerCase()) {
    return normalizeCursorPayload(p, eventName);
  }
  const tool = (p?.__kh_tool as string | undefined) ?? "claude";
  if (tool === "gemini") return normalizeGeminiPayload(p, eventName);
  return normalizeClaudePayload(p, eventName, tool === "codex" ? "codex" : "claude");
}

// Wrappers Claude Code's runtime uses to inject system-generated text
// into a session via the UserPromptSubmit channel — Monitor events,
// system reminders, slash-command resolutions, etc. They appear
// alongside real user text (e.g. system-reminder injected before what
// the King actually typed), so we strip them out and only drop the
// prompt if NOTHING substantive remains.
const SYNTHETIC_PROMPT_TAGS = [
  "task-notification",
  "system-reminder",
  "command-name",
  "command-message",
  "command-args",
  "local-command-stdout",
  "local-command-stderr",
  "bash-input",
  "bash-stdout",
  "bash-stderr",
  "user-prompt-submit-hook",
  "file-write-stdout",
];

function stripSyntheticWrappers(text: string): string {
  let out = text;
  for (const tag of SYNTHETIC_PROMPT_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "g");
    out = out.replace(re, "");
  }
  return out;
}

function isSyntheticUserPrompt(text: unknown): boolean {
  if (typeof text !== "string" || !text) return false;
  return stripSyntheticWrappers(text).trim().length === 0;
}

function normalizeClaudePayload(
  p: HookPayload,
  eventName: string,
  tool: "claude" | "codex" = "claude"
): AgentEvent | null {
  if (!p?.session_id) return null;
  const ts = Date.now();
  const requestId = p?.__kh_permission_request_id as string | undefined;
  // Use the raw session_id for both Claude and Codex. Codex's CLI
  // adapter (codex-cli.ts) registers spawned sessions under their raw
  // thread_id; the bridge must match so a hooked Codex session and a
  // spawned Codex session for the same thread land on the same wielder
  // instead of splitting in two. (UUIDs => no realistic Claude/Codex
  // session-id collision; the `tool` field disambiguates anyway.)
  const base = {
    sessionId: p.session_id as string,
    tool,
    cwd: (p.cwd as string) ?? process.cwd(),
    source: "hook" as const,
  };

  // PermissionRequest with a request_id means the Python script wants a
  // permission decision back. Emit as permission_request, not tool_use.
  // Permission requests bypass the spawned-session filter — keykeeper
  // wants to gate spawned sessions too. (PreToolUse + request_id is
  // also accepted for back-compat with any in-flight scripts.)
  if (
    (eventName === "PermissionRequest" || eventName === "PreToolUse") &&
    requestId
  ) {
    return {
      ...base,
      timestamp: ts,
      kind: "permission_request",
      payload: {
        name: canonicalToolName(p.tool_name),
        input: p.tool_input,
        requestId,
      },
    };
  }

  // For non-permission events, skip sessions we spawned ourselves —
  // those events come through the spawn channel directly with richer
  // payloads, so hook duplicates would double-emit. Both the Claude
  // and Codex CLI adapters register their spawned session IDs with
  // this tracker (registerSpawnedSession in claude-cli.ts), so the
  // gate works for both tools. Cursor spawns aren't relevant — Cursor
  // sessions live in a different ID namespace and the bridge already
  // routes them through normalizeCursorPayload.
  if (isSpawnedSession(p.session_id)) return null;

  const map: Record<string, AgentEventKind> = {
    PreToolUse: "tool_use",
    PostToolUse: "tool_result",
    UserPromptSubmit: "user_prompt",
    SessionStart: "session_start",
    SessionEnd: "session_end",
    Stop: "session_end",
    SubagentStop: "subagent_spawn",
  };
  const kind = map[eventName];
  if (!kind) return null;

  // Synthetic UserPromptSubmit (Monitor task-notifications, system
  // reminders, command-name resolutions, etc.) — drop so they don't
  // pollute the activity log.
  if (
    kind === "user_prompt" &&
    isSyntheticUserPrompt(p.prompt ?? p.user_prompt)
  ) {
    return null;
  }

  return {
    ...base,
    timestamp: ts,
    kind,
    payload: {
      name: canonicalToolName(p.tool_name),
      input: p.tool_input,
      output: p.tool_response,
      text:
        typeof p.prompt === "string"
          ? p.prompt
          : typeof p.user_prompt === "string"
          ? p.user_prompt
          : undefined,
      // Claude's PostToolUse carries duration_ms (verified empirically);
      // pass through so the renderer can chip slow tools without the
      // computed-from-timestamp fallback.
      durationMs:
        typeof p.duration_ms === "number" ? p.duration_ms : undefined,
    },
  };
}

function normalizeGeminiPayload(
  p: HookPayload,
  eventName: string
): AgentEvent | null {
  const ts = Date.now();
  const cwd = nonEmptyString(p.cwd) ?? process.cwd();
  const sessionId =
    nonEmptyString(p.session_id) ??
    nonEmptyString(p.sessionId) ??
    nonEmptyString(p.transcript_path) ??
    `gemini-${dedupeHash(cwd)}`;
  const parentSessionId = geminiParentSessionFromTranscriptPath(
    p.transcript_path,
    sessionId
  );
  const requestId = nonEmptyString(p.__kh_permission_request_id);
  const base = {
    sessionId,
    tool: "gemini" as const,
    cwd,
    source: "hook" as const,
  };

  // Gemini's Notification/ToolPermission hook is observational only; hook
  // output cannot grant or deny it. Do not render an ack card because it looks
  // like a broken permission prompt. BeforeTool below is the actionable gate.
  if (
    eventName === "Notification" &&
    p.notification_type === "ToolPermission"
  ) {
    return null;
  }

  // Gemini BeforeTool with a request_id means the Python script is blocking
  // on Keykeeper. This fires for every tool call; allow only continues the hook
  // path, while deny blocks before Gemini executes the tool.
  if (eventName === "BeforeTool" && requestId) {
    return {
      ...base,
      timestamp: ts,
      kind: "permission_request",
      payload: {
        name: canonicalToolName(p.tool_name),
        input: p.tool_input,
        requestId,
        parentSessionId,
      },
    };
  }

  // Spawned Gemini sessions are observed through `--output-format
  // stream-json`; skip duplicate hook events once the adapter has the
  // session id registered.
  if (isSpawnedSession(sessionId)) return null;

  switch (eventName) {
    case "SessionStart":
      return {
        ...base,
        timestamp: ts,
        kind: "session_start",
        payload: {
          text: (p.source as string) ?? "startup",
          parentSessionId,
        },
      };
    case "SessionEnd":
      return {
        ...base,
        timestamp: ts,
        kind: "session_end",
        payload: { text: (p.reason as string) ?? "", parentSessionId },
      };
    case "BeforeAgent":
      if (isSyntheticUserPrompt(p.prompt)) return null;
      return {
        ...base,
        timestamp: ts,
        kind: "user_prompt",
        payload: { text: (p.prompt as string) ?? "", parentSessionId },
      };
    case "BeforeTool":
      return {
        ...base,
        timestamp: ts,
        kind: "tool_use",
        payload: {
          name: canonicalToolName(p.tool_name),
          input: p.tool_input,
          parentSessionId,
        },
      };
    case "AfterTool":
      return {
        ...base,
        timestamp: ts,
        kind: "tool_result",
        payload: {
          name: canonicalToolName(p.tool_name),
          input: p.tool_input,
          output: p.tool_response,
          parentSessionId,
        },
      };
    case "AfterAgent":
      return {
        ...base,
        timestamp: ts,
        kind: "assistant_text",
        payload: {
          text: (p.prompt_response as string) ?? "",
          parentSessionId,
        },
      };
    case "BeforeModel":
    case "BeforeToolSelection":
    case "AfterModel":
    case "PreCompress":
      return null;
    default:
      return null;
  }
}

/**
 * Cursor hook events — camelCase names; carry `conversation_id` instead
 * of `session_id`. Replaced the old SQLite poller; this is the
 * canonical observability path for Cursor sessions.
 */
function normalizeCursorPayload(
  p: HookPayload,
  eventName: string
): AgentEvent | null {
  const ts = Date.now();
  const conversationId = p?.conversation_id as string | undefined;
  // beforeShellExecution doesn't carry conversation_id at the top level
  // for older Cursor versions in some configurations; fall through if
  // we have nothing to key off of.
  if (!conversationId) return null;
  const base = {
    sessionId: `cursor-${conversationId}`,
    tool: "cursor" as const,
    cwd:
      (p.cwd as string) ??
      (Array.isArray(p.workspace_roots) && typeof p.workspace_roots[0] === "string"
        ? p.workspace_roots[0]
        : process.cwd()),
    source: "hook" as const,
  };

  switch (eventName) {
    case "sessionStart":
      return {
        ...base,
        timestamp: ts,
        kind: "session_start",
        payload: { text: "Cursor chat" },
      };
    case "sessionEnd":
    case "stop":
      return {
        ...base,
        timestamp: ts,
        kind: "session_end",
        payload: { text: (p.reason as string) ?? (p.status as string) ?? "" },
      };
    case "beforeSubmitPrompt":
      return {
        ...base,
        timestamp: ts,
        kind: "user_prompt",
        payload: { text: (p.prompt as string) ?? "" },
      };
    case "preToolUse":
      // Both beforeShellExecution and preToolUse fire for shell tools;
      // beforeShellExecution returns null in this normalizer (handled
      // as observation-only at the script level) so preToolUse owns
      // the tool_use event with the richer tool_input shape.
      return {
        ...base,
        timestamp: ts,
        kind: "tool_use",
        payload: {
          name: canonicalToolName(p.tool_name),
          input: p.tool_input,
        },
      };
    case "postToolUse":
      return {
        ...base,
        timestamp: ts,
        kind: "tool_result",
        payload: {
          name: canonicalToolName(p.tool_name),
          input: p.tool_input,
          output: p.tool_output,
          // Cursor uses `duration` (ms), Codex uses `duration_ms`. Pass
          // through so the renderer can chip slow tools.
          durationMs:
            typeof p.duration === "number"
              ? p.duration
              : typeof p.duration_ms === "number"
              ? p.duration_ms
              : undefined,
        },
      };
    case "afterAgentResponse":
      return {
        ...base,
        timestamp: ts,
        kind: "assistant_text",
        payload: { text: (p.text as string) ?? "" },
      };
    case "beforeShellExecution": {
      // Observational permission letter. Script returns "ask" so
      // Cursor's native UI decides; we still emit a permission_request
      // event so the renderer pops a letter for visibility. The
      // letter's actions are restricted to "dismiss" by the store
      // when event.tool === "cursor" (allow/deny wouldn't reach
      // Cursor — its UI is already in control by the time the user
      // could click). Synthesizes a Bash-like input so the existing
      // risk classifier in store.ts works unchanged.
      const requestId = p.__kh_permission_request_id as string | undefined;
      if (!requestId) return null;
      return {
        ...base,
        timestamp: ts,
        kind: "permission_request",
        payload: {
          name: "Bash",
          input: { command: p.command, cwd: p.cwd },
          requestId,
        },
      };
    }
    default:
      return null;
  }
}
