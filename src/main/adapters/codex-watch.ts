/**
 * Codex passive monitor.
 *
 * Codex CLI persists every session as a JSONL rollout file at:
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl
 *
 * Each line is one event: session_meta, response_item, function_call,
 * function_call_output, agent_message, etc. We poll the sessions directory
 * for new files (new sessions) or growth in existing files (new events),
 * read only the new bytes, parse, and emit normalized AgentEvents.
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
import type { AgentEvent } from "@shared/events";

const SESSIONS_ROOT = join(homedir(), ".codex", "sessions");

type FileState = {
  path: string;
  threadId: string;
  cwd: string;
  size: number;
  carry: string;
};

const files = new Map<string, FileState>();
const sessionsAnnounced = new Set<string>();
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

function readRange(path: string, fromByte: number, toByte: number): string {
  const len = toByte - fromByte;
  if (len <= 0) return "";
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, fromByte);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function emit(ev: AgentEvent) {
  bus.emitAgentEvent(ev);
}

function processLine(line: string, state: FileState) {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const type = String(msg.type ?? "");
  const ts = typeof msg.timestamp === "string" ? Date.parse(msg.timestamp) : Date.now();
  const sessionId = `codex-${state.threadId}`;
  const base = { sessionId, tool: "codex" as const, cwd: state.cwd, source: "hook" as const };

  if (type === "session_meta") {
    const payload = (msg.payload as Record<string, unknown>) ?? {};
    if (typeof payload.cwd === "string") state.cwd = payload.cwd;
    if (!sessionsAnnounced.has(sessionId)) {
      sessionsAnnounced.add(sessionId);
      emit({
        ...base,
        cwd: state.cwd,
        timestamp: ts,
        kind: "session_start",
        payload: { text: "Codex session" },
      });
    }
    return;
  }

  // Ensure session_start fires even for files we joined late
  if (!sessionsAnnounced.has(sessionId)) {
    sessionsAnnounced.add(sessionId);
    emit({
      ...base,
      timestamp: ts,
      kind: "session_start",
      payload: { text: "Codex session" },
    });
  }

  if (type === "response_item") {
    const payload = (msg.payload as Record<string, unknown>) ?? {};
    if (payload.type === "message") {
      const role = String(payload.role ?? "");
      const content = payload.content as Array<Record<string, unknown>> | undefined;
      const text =
        Array.isArray(content)
          ? content
              .map((c) => (typeof c?.text === "string" ? c.text : ""))
              .filter(Boolean)
              .join("\n")
          : "";
      if (role === "user" && text && !text.startsWith("<environment_context>")) {
        emit({ ...base, timestamp: ts, kind: "user_prompt", payload: { text } });
      } else if (role === "assistant" && text) {
        emit({ ...base, timestamp: ts, kind: "assistant_text", payload: { text } });
      }
      // 'developer' messages = system/permissions context — skip
    }
  } else if (type === "agent_message") {
    const payload = (msg.payload as Record<string, unknown>) ?? {};
    const text = typeof payload.text === "string" ? payload.text : String(msg.text ?? "");
    if (text) emit({ ...base, timestamp: ts, kind: "assistant_text", payload: { text } });
  } else if (type === "function_call") {
    const payload = (msg.payload as Record<string, unknown>) ?? {};
    const name = String(payload.name ?? msg.name ?? "tool");
    let input: unknown = payload.arguments ?? msg.arguments;
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        // keep string
      }
    }
    emit({ ...base, timestamp: ts, kind: "tool_use", payload: { name, input } });
  } else if (type === "function_call_output" || type === "custom_tool_call_output") {
    const payload = (msg.payload as Record<string, unknown>) ?? {};
    const output = payload.output ?? payload.result ?? msg.output ?? msg.result;
    emit({ ...base, timestamp: ts, kind: "tool_result", payload: { output } });
  } else if (type === "custom_tool_call") {
    const payload = (msg.payload as Record<string, unknown>) ?? {};
    const name = String(payload.name ?? "custom");
    emit({
      ...base,
      timestamp: ts,
      kind: "tool_use",
      payload: { name, input: payload.input ?? payload.arguments },
    });
  } else if (type === "exec_command_end") {
    const payload = (msg.payload as Record<string, unknown>) ?? {};
    emit({
      ...base,
      timestamp: ts,
      kind: "tool_result",
      payload: {
        output: {
          exit_code: payload.exit_code,
          stdout: payload.stdout,
          stderr: payload.stderr,
        },
      },
    });
  }
}

function pollOnce() {
  const paths = listJsonlFiles();
  for (const p of paths) {
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    let state = files.get(p);
    if (!state) {
      state = {
        path: p,
        threadId: threadIdFromFilename(p),
        cwd: process.cwd(),
        size: st.size,
        carry: "",
      };
      files.set(p, state);
      // Don't replay history — start tracking from current size.
      continue;
    }
    if (st.size <= state.size) continue;
    const chunk = readRange(p, state.size, st.size);
    state.size = st.size;
    const buf = state.carry + chunk;
    const lines = buf.split("\n");
    state.carry = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) processLine(trimmed, state);
    }
  }
}

export function startCodexWatch(intervalMs = 3000) {
  if (pollTimer) return;
  if (!existsSync(SESSIONS_ROOT)) {
    // eslint-disable-next-line no-console
    console.log(`[kh-rts/codex] sessions dir missing: ${SESSIONS_ROOT}`);
    return;
  }
  // Baseline: record all existing files with current sizes (no history replay)
  for (const p of listJsonlFiles()) {
    try {
      const st = statSync(p);
      files.set(p, {
        path: p,
        threadId: threadIdFromFilename(p),
        cwd: process.cwd(),
        size: st.size,
        carry: "",
      });
    } catch {
      // skip
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    `[kh-rts/codex] watch started, ${files.size} existing rollout file(s), polling every ${intervalMs}ms`
  );
  pollTimer = setInterval(pollOnce, intervalMs);
}

export function stopCodexWatch() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  files.clear();
  sessionsAnnounced.clear();
}
