/**
 * Codex assistant_text watcher.
 *
 * Codex hooks cover SessionStart / UserPromptSubmit / PreToolUse /
 * PostToolUse / PermissionRequest / Stop, but no `afterAgentResponse`
 * equivalent — agent text is missing. Codex persists each session's
 * full event stream as JSONL at:
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<thread-id>.jsonl
 *
 * Each line is one event. For agent text we look at:
 *   { type: "item.completed", item: { type: "agent_message", text: "..." } }
 *
 * We tail every session file for new agent_message items and emit
 * `assistant_text` events. Everything else (tool_use, permission,
 * lifecycle) flows through hooks already, so we ignore those item
 * types here to avoid duplicates.
 */

import { homedir } from "node:os";
import {
  existsSync,
  readdirSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";
import { bus } from "../event-bus";
import { CodexTranscriptLineSchema } from "@shared/schemas";

const SESSIONS_ROOT = join(homedir(), ".codex", "sessions");

type FileState = {
  path: string;
  threadId: string;
  cwd: string;
  size: number;
  carry: string;
  emittedItemIds: Set<string>;
};

const files = new Map<string, FileState>();
let pollTimer: NodeJS.Timeout | null = null;

function listJsonlFiles(): string[] {
  if (!existsSync(SESSIONS_ROOT)) return [];
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full, depth + 1);
      else if (e.endsWith(".jsonl")) out.push(full);
    }
  };
  walk(SESSIONS_ROOT, 0);
  return out;
}

export function threadIdFromFilename(path: string): string {
  // rollout-2026-04-26T17-15-03-019dcc4a-2230-7953-b4fc-4f2eb06b0d49.jsonl
  const base = path.split("/").pop() ?? "";
  const m =
    /rollout-.*?-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(
      base
    );
  return m ? m[1] : base;
}

function readNewLines(state: FileState): string[] {
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(state.path);
  } catch {
    return [];
  }
  if (st.size === state.size) return [];
  if (st.size < state.size) {
    state.size = st.size;
    state.carry = "";
    return [];
  }
  const fd = openSync(state.path, "r");
  try {
    const len = st.size - state.size;
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, state.size);
    state.size = st.size;
    const chunk = state.carry + buf.toString("utf8");
    const lines = chunk.split("\n");
    state.carry = lines.pop() ?? "";
    return lines;
  } finally {
    closeSync(fd);
  }
}

function emitAssistantText(state: FileState, text: string, id?: string) {
  if (!text.trim()) return;
  if (id && state.emittedItemIds.has(id)) return;
  if (id) state.emittedItemIds.add(id);
  bus.emitAgentEvent({
    sessionId: state.threadId,
    tool: "codex",
    cwd: state.cwd,
    timestamp: Date.now(),
    kind: "assistant_text",
    payload: { text },
    source: "hook",
  });
}

export function parseCodexTranscriptLine(
  line: string
):
  | { type: "cwd"; cwd: string }
  | { type: "assistant_text"; text: string; id?: string }
  | null {
  if (!line.trim()) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const result = CodexTranscriptLineSchema.safeParse(raw);
  if (!result.success) return null;
  const msg = result.data;
  if (msg.type === "session_meta") {
    const payload = msg.payload as { cwd?: unknown } | undefined;
    const cwd = payload?.cwd ?? msg.cwd;
    return typeof cwd === "string" && cwd ? { type: "cwd", cwd } : null;
  }
  if (msg.type === "item.completed") {
    const item = msg.item as Record<string, unknown> | undefined;
    if (item?.type === "agent_message" && typeof item.text === "string") {
      return {
        type: "assistant_text",
        text: item.text,
        id: typeof item.id === "string" ? item.id : undefined,
      };
    }
    return null;
  }
  if (msg.type === "response_item") {
    const p = msg.payload as Record<string, unknown> | undefined;
    if (
      p?.type === "message" &&
      p.role === "assistant" &&
      p.phase === "final_answer" &&
      Array.isArray(p.content)
    ) {
      const text = p.content
        .filter(
          (c): c is { type: "output_text"; text: string } =>
            !!c &&
            typeof c === "object" &&
            (c as { type?: unknown }).type === "output_text" &&
            typeof (c as { text?: unknown }).text === "string"
        )
        .map((c) => c.text)
        .join("\n\n");
      if (!text.trim()) return null;
      return {
        type: "assistant_text",
        text,
        id: `t:${text.slice(0, 200)}:${text.length}`,
      };
    }
  }
  return null;
}

function processLine(state: FileState, line: string) {
  const parsed = parseCodexTranscriptLine(line);
  if (!parsed) return;
  if (parsed.type === "cwd") state.cwd = parsed.cwd;
  else emitAssistantText(state, parsed.text, parsed.id);
}

function pollOnce() {
  for (const path of listJsonlFiles()) {
    if (files.has(path)) continue;
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      continue;
    }
    files.set(path, {
      path,
      threadId: threadIdFromFilename(path),
      cwd: process.cwd(),
      size, // start at current size — don't replay history
      carry: "",
      emittedItemIds: new Set(),
    });
  }
  for (const state of files.values()) {
    const lines = readNewLines(state);
    for (const line of lines) processLine(state, line);
  }
}

export function startCodexTranscriptWatcher(intervalMs = 2000) {
  if (pollTimer) return;
  if (!existsSync(SESSIONS_ROOT)) {
    console.log(
      `[keykeeper/codex-transcript] no sessions dir at ${SESSIONS_ROOT}; watcher disabled`
    );
    return;
  }

  console.log(
    `[keykeeper/codex-transcript] watcher started, polling every ${intervalMs}ms`
  );
  pollOnce();
  pollTimer = setInterval(pollOnce, intervalMs);
}

export function stopCodexTranscriptWatcher() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  files.clear();
}
