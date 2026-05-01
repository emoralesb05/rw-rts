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

function threadIdFromFilename(path: string): string {
  // rollout-2026-04-26T17-15-03-019dcc4a-2230-7953-b4fc-4f2eb06b0d49.jsonl
  const base = path.split("/").pop() ?? "";
  const m = /rollout-.*?-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(
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

function processLine(state: FileState, line: string) {
  if (!line.trim()) return;
  let msg: any;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  // session_meta carries the cwd. Format varies by Codex version: older
  // CLI puts it at top-level, 0.126+ (vscode/desktop) nests it under
  // payload. Capture from whichever is present.
  if (msg.type === "session_meta") {
    const cwd = msg?.payload?.cwd ?? msg?.cwd;
    if (typeof cwd === "string" && cwd) state.cwd = cwd;
    return;
  }
  // Old format (Codex CLI ≤ 0.125):
  //   {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
  if (msg.type === "item.completed") {
    const item = msg.item;
    if (item && item.type === "agent_message") {
      emitAssistantText(
        state,
        typeof item.text === "string" ? item.text : "",
        typeof item.id === "string" ? item.id : undefined
      );
    }
    return;
  }
  // New format (Codex 0.126+, vscode/desktop):
  //   {"type":"response_item","payload":{"type":"message","role":"assistant",
  //     "content":[{"type":"output_text","text":"..."}],"phase":"final_answer"}}
  // Only emit on the FINAL answer (phase === "final_answer") — earlier
  // phases are reasoning steps the user shouldn't see in the chat stream.
  if (msg.type === "response_item") {
    const p = msg.payload;
    if (
      p &&
      p.type === "message" &&
      p.role === "assistant" &&
      p.phase === "final_answer" &&
      Array.isArray(p.content)
    ) {
      const text = p.content
        .filter((c: any) => c?.type === "output_text" && typeof c.text === "string")
        .map((c: any) => c.text)
        .join("\n\n");
      // No id in this format; dedup by text hash so a same-content reply
      // can't double-emit if the file gets re-scanned for any reason.
      const dedupKey = `t:${text.slice(0, 200)}:${text.length}`;
      emitAssistantText(state, text, dedupKey);
    }
    return;
  }
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
    // eslint-disable-next-line no-console
    console.log(
      `[keykeeper/codex-transcript] no sessions dir at ${SESSIONS_ROOT}; watcher disabled`
    );
    return;
  }
  // eslint-disable-next-line no-console
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
