import { createServer, Server, Socket } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { bus } from "../event-bus";
import { isSpawnedSession } from "./claude-cli";
import type { AgentEvent, AgentEventKind, AgentTool } from "@shared/events";
import type { PermissionDecision } from "@shared/ipc";

export const SOCKET_PATH = join(homedir(), ".claude", "kh-rts.sock");

let server: Server | null = null;

/**
 * Pending PermissionRequest entries, keyed by the request_id the Python
 * hook tagged the payload with. We hold the open socket here until the
 * renderer comes back with allow/deny via IPC, then write the reply
 * and close. There is no safety timer — the user explicitly chose to
 * wait indefinitely rather than risk a stale auto-dismiss before they
 * decided. If the socket errors (e.g. Python died, connection reset),
 * the error handler emits permission_resolved("error") so the renderer
 * can drop the now-unanswerable letter.
 *
 * `tool` is captured so error-path events get the right tool stamp;
 * the Python script handles output-shape translation, so the bridge's
 * reply payload is the same generic shape for both Claude and Cursor.
 */
type Pending = {
  socket: Socket;
  sessionId: string;
  cwd: string;
  tool: AgentTool;
};
const pending = new Map<string, Pending>();

function emitPermissionResolved(
  ctx: { sessionId: string; cwd: string; tool: AgentTool },
  requestId: string,
  resolution: "error"
) {
  bus.emitAgentEvent({
    sessionId: ctx.sessionId,
    tool: ctx.tool,
    cwd: ctx.cwd,
    source: "hook",
    timestamp: Date.now(),
    kind: "permission_resolved",
    payload: { requestId, resolution },
  });
}

/**
 * Both Cursor and Claude empirically fire some hooks twice per logical
 * event (validate-then-execute pass, or similar). Examples:
 *   Cursor: beforeSubmitPrompt, preToolUse, postToolUse, stop
 *   Claude: UserPromptSubmit (sometimes)
 *
 * Single-entry installs verified, no other forwarders found — the
 * doubling originates upstream and we can't suppress it there. So
 * dedupe at the bridge: drop the second fire of an identical event
 * within DEDUPE_TTL_MS.
 *
 * Permission-request events are exempt — they each carry a unique
 * request_id and need their socket kept open for the renderer reply.
 *
 * Key construction:
 *   - tool_use_id when present (Cursor preToolUse/postToolUse + Claude
 *     PreToolUse/PostToolUse share this across pre/post, so combining
 *     with eventName disambiguates)
 *   - otherwise hash of meaningful payload fields
 */
const DEDUPE_TTL_MS = 1500;
const recentEventKeys = new Map<string, number>();

function dedupeHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

function dedupeKeyFor(payload: any, eventName: string): string {
  const sessionId =
    (payload.session_id as string) ??
    (payload.conversation_id as string) ??
    "";
  const toolUseId = payload.tool_use_id as string | undefined;
  if (toolUseId) return `${eventName}:${sessionId}:tu:${toolUseId}`;
  // Hash the full payload minus our own marker. Two distinct user
  // prompts will differ at least in their prompt text; two fires of
  // the same logical event have identical payloads from the upstream.
  // Hashing a curated subset (`prompt`/`tool_name`/etc.) was too loose
  // — it false-positived distinct Claude prompts whose text lived in
  // a field name we hadn't anticipated.
  const sanitized: Record<string, unknown> = {};
  for (const k of Object.keys(payload)) {
    if (k === "__kh_permission_request_id") continue;
    sanitized[k] = payload[k];
  }
  const sig = dedupeHash(JSON.stringify(sanitized));
  return `${eventName}:${sessionId}:${sig}`;
}

function isDuplicateHookFire(payload: any, eventName: string): boolean {
  const now = Date.now();
  if (recentEventKeys.size > 200) {
    for (const [k, exp] of recentEventKeys) {
      if (exp <= now) recentEventKeys.delete(k);
    }
  }
  const key = dedupeKeyFor(payload, eventName);
  const existing = recentEventKeys.get(key);
  if (existing && existing > now) return true;
  recentEventKeys.set(key, now + DEDUPE_TTL_MS);
  return false;
}

export function startHookBridge() {
  if (server) return;
  if (existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH);
    } catch {
      // ignore
    }
  }
  // allowHalfOpen lets us keep the write side of the socket open after
  // the client sends FIN (Python's shutdown(SHUT_WR)). Required for the
  // bidirectional permission flow — without this, Node auto-closes the
  // socket on "end" and resolvePermissionRequest has nothing to write to.
  server = createServer({ allowHalfOpen: true }, (socket: Socket) => {
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
    });
    const finalize = () => {
      if (!buf.trim()) {
        socket.destroy();
        return;
      }
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(buf);
      } catch {
        socket.destroy();
        return;
      }
      const eventName = (payload?.hook_event_name as string) ?? "?";
      const sid =
        (payload?.session_id as string) ??
        (payload?.conversation_id as string) ??
        "?";
      const ev = normalizeHookPayload(payload);
      // Dedupe non-permission events. Permission requests carry a
      // unique request_id and must hold the socket open for the
      // renderer's reply, so we never drop them here.
      const isPerm = ev?.kind === "permission_request";
      const dup = ev && !isPerm && isDuplicateHookFire(payload, eventName);
      // eslint-disable-next-line no-console
      console.log(
        `[kh-rts/bridge] hook ${eventName} sid=${sid.slice(0, 12)} → ${
          ev ? `${ev.tool}/${ev.kind}${dup ? " DEDUP" : ""}` : "DROPPED"
        }`
      );
      if (!ev || dup) {
        socket.destroy();
        return;
      }
      bus.emitAgentEvent(ev);
      // permission_request needs the socket kept open until the renderer
      // resolves it. All other events are fire-and-forget.
      if (ev.kind === "permission_request" && ev.payload.requestId) {
        const id = ev.payload.requestId;
        // No timer — the entry stays open until the GUI resolves it,
        // the socket errors, or the bridge shuts down (e.g. main exit).
        // Python's recv() blocks the same way; if the GUI dies, socket
        // tear-down will surface as recv EOF on its end.
        pending.set(id, {
          socket,
          sessionId: ev.sessionId,
          cwd: ev.cwd,
          tool: ev.tool,
        });
      } else {
        socket.destroy();
      }
    };
    socket.on("end", finalize);
    socket.on("error", () => {
      // If a pending socket errors, drop it and tell the renderer so
      // the orphaned letter gets dismissed (no way to reply now).
      for (const [id, p] of pending) {
        if (p.socket === socket) {
          pending.delete(id);
          emitPermissionResolved(
            { sessionId: p.sessionId, cwd: p.cwd, tool: p.tool },
            id,
            "error"
          );
        }
      }
      socket.destroy();
    });
    // Cursor handoff path: when the Python script's recv times out and
    // closes the socket, "close" fires (often without "error"). Drop
    // the pending entry silently so it doesn't leak. We don't emit
    // permission_resolved here — the keykeeper letter stays put as
    // informational context while Cursor's native dialog takes over.
    // The cursor SQLite poller will pick up the eventual decision and
    // the renderer's heuristic auto-dismiss can clean up the letter.
    socket.on("close", () => {
      for (const [id, p] of pending) {
        if (p.socket === socket) pending.delete(id);
      }
    });
  });
  server.listen(SOCKET_PATH, () => {
    // eslint-disable-next-line no-console
    console.log("[kh-rts] hook bridge listening on", SOCKET_PATH);
  });
}

export function stopHookBridge() {
  // Resolve any pending requests with a silent close so Python isn't
  // stuck waiting for us across a restart.
  for (const [, p] of pending) {
    try {
      p.socket.end();
    } catch {
      /* ignore */
    }
  }
  pending.clear();
  server?.close();
  server = null;
  if (existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH);
    } catch {
      // ignore
    }
  }
}

/**
 * Resolve a pending permission request — write the JSON reply on the
 * still-open hook socket and close it. Called by main from the
 * IPC.ResolvePermission handler. Returns false if no pending entry
 * exists, which the renderer treats as "already resolved elsewhere"
 * and uses to dismiss the now-stale letter.
 */
export function resolvePermissionRequest(
  requestId: string,
  decision: PermissionDecision,
  message?: string
): boolean {
  const p = pending.get(requestId);
  if (!p) {
    // eslint-disable-next-line no-console
    console.log(
      `[kh-rts/bridge] resolve ${requestId} = ${decision} — NO PENDING ENTRY (already resolved or expired)`
    );
    return false;
  }
  pending.delete(requestId);
  try {
    // denyMessage is read by bin/kh-rts-hook and only emitted to the
    // upstream when behavior=deny — Claude's PermissionRequest contract
    // has no message field for allow, and Cursor's shape uses
    // user_message/agent_message instead.
    const reply = JSON.stringify({
      permissionDecision: decision,
      denyMessage: decision === "deny" ? (message ?? undefined) : undefined,
    });
    // eslint-disable-next-line no-console
    console.log(
      `[kh-rts/bridge] resolve ${requestId} (tool=${p.tool}) → ${reply}`
    );
    p.socket.end(reply);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`[kh-rts/bridge] resolve ${requestId} write FAILED:`, e);
  }
  return true;
}

/**
 * Read-only inspector for diagnostics / tests.
 */
export function pendingPermissionCount(): number {
  return pending.size;
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
};

function canonicalToolName(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  return TOOL_NAME_CANONICAL[raw] ?? raw;
}

function normalizeHookPayload(p: any): AgentEvent | null {
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

function isSyntheticUserPrompt(text: string | undefined): boolean {
  if (!text) return false;
  return stripSyntheticWrappers(text).trim().length === 0;
}

function normalizeClaudePayload(
  p: any,
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
  // instead of splitting in two. (UUIDs ⇒ no realistic Claude/Codex
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
      text: p.prompt ?? p.user_prompt,
    },
  };
}

/**
 * Cursor hook events — camelCase names; carry `conversation_id` instead
 * of `session_id`. Replaced the old SQLite poller; this is the
 * canonical observability path for Cursor sessions.
 */
function normalizeCursorPayload(p: any, eventName: string): AgentEvent | null {
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
