/**
 * Claude assistant_text watcher.
 *
 * Claude's hook system fires for SessionStart / UserPromptSubmit /
 * PreToolUse / PostToolUse / PermissionRequest / Stop, but doesn't
 * expose the assistant's reply text — neither Cursor's
 * `afterAgentResponse` nor Codex's `item.completed` equivalent. The
 * full conversation IS persisted to a JSONL transcript at
 * `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`. We poll that
 * directory, tail each file for new lines, and emit `assistant_text`
 * events for the text content blocks of `type: "assistant"` lines.
 *
 * Spawned Claude sessions stream their own assistant text via the
 * spawn-stdout channel (claude-cli.ts), so we skip transcripts whose
 * sessionId is in the spawned-session registry to avoid duplicates.
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
import { isSpawnedSession } from "./claude-cli";
import { ClaudeTranscriptLineSchema } from "@shared/schemas";

const PROJECTS_ROOT = join(homedir(), ".claude", "projects");
export const CLAUDE_TRANSCRIPT_POLL_MS = 2000;

export function getClaudeTranscriptProjectsRoot(): string {
  return PROJECTS_ROOT;
}

type FileState = {
  path: string;
  sessionId: string;
  cwd: string;
  size: number;
  carry: string;
  emittedUuids: Set<string>;
};

const files = new Map<string, FileState>();
let pollTimer: NodeJS.Timeout | null = null;

/** Decode the project-folder name back to its cwd. Claude encodes
 * `/Users/ed/foo` as `-Users-ed-foo`. Naive replacement works because
 * folder names don't contain hyphens that aren't path separators
 * (Claude refuses to encode paths that would collide). */
function decodeCwd(folder: string): string {
  return folder.replace(/-/g, "/");
}

function listSessionFiles(): {
  path: string;
  sessionId: string;
  cwd: string;
}[] {
  if (!existsSync(PROJECTS_ROOT)) return [];
  const out: { path: string; sessionId: string; cwd: string }[] = [];
  let folders: string[] = [];
  try {
    folders = readdirSync(PROJECTS_ROOT);
  } catch {
    return [];
  }
  for (const folder of folders) {
    const folderPath = join(PROJECTS_ROOT, folder);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(folderPath);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const cwd = decodeCwd(folder);
    let entries: string[] = [];
    try {
      entries = readdirSync(folderPath);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!f.endsWith(".jsonl")) continue;
      const sessionId = f.slice(0, -".jsonl".length);
      out.push({ path: join(folderPath, f), sessionId, cwd });
    }
  }
  return out;
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
    // File got truncated/rotated — reset.
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

export function parseClaudeAssistantTranscriptLine(
  line: string
): { id?: string; text: string; timestamp: number } | null {
  if (!line.trim()) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const result = ClaudeTranscriptLineSchema.safeParse(raw);
  if (!result.success) return null;
  const msg = result.data;
  if (msg.type !== "assistant") return null;
  const content = msg.message?.content;
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const c of content) {
    if (c?.type === "text" && typeof c.text === "string") {
      texts.push(c.text);
    }
  }
  if (texts.length === 0) return null;
  const tsRaw = msg.timestamp;
  const ts =
    typeof tsRaw === "string"
      ? Date.parse(tsRaw)
      : typeof tsRaw === "number"
        ? tsRaw
        : NaN;
  const id =
    typeof msg.uuid === "string"
      ? msg.uuid
      : typeof msg.requestId === "string"
        ? msg.requestId
        : undefined;
  return {
    id,
    text: texts.join("\n\n"),
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
  };
}

function processLine(state: FileState, line: string) {
  const parsed = parseClaudeAssistantTranscriptLine(line);
  if (!parsed) return;
  if (parsed.id && state.emittedUuids.has(parsed.id)) return;
  if (parsed.id) state.emittedUuids.add(parsed.id);
  bus.emitAgentEvent({
    sessionId: state.sessionId,
    tool: "claude",
    cwd: state.cwd,
    timestamp: parsed.timestamp,
    kind: "assistant_text",
    payload: { text: parsed.text },
    source: "hook",
  });
}

function pollOnce() {
  for (const f of listSessionFiles()) {
    if (files.has(f.path)) continue;
    let size = 0;
    try {
      size = statSync(f.path).size;
    } catch {
      continue;
    }
    // Start at current size — don't replay historical sessions on
    // first launch. New text written from now on will be tailed.
    files.set(f.path, {
      path: f.path,
      sessionId: f.sessionId,
      cwd: f.cwd,
      size,
      carry: "",
      emittedUuids: new Set(),
    });
  }
  for (const state of files.values()) {
    if (isSpawnedSession(state.sessionId)) continue;
    const lines = readNewLines(state);
    for (const line of lines) processLine(state, line);
  }
}

export function startClaudeTranscriptWatcher(
  intervalMs = CLAUDE_TRANSCRIPT_POLL_MS
) {
  if (pollTimer) return;
  if (!existsSync(PROJECTS_ROOT)) {
    console.log(
      `[realmkeeper/claude-transcript] no projects dir at ${PROJECTS_ROOT}; watcher disabled`
    );
    return;
  }

  console.log(
    `[realmkeeper/claude-transcript] watcher started, polling every ${intervalMs}ms`
  );
  pollOnce();
  pollTimer = setInterval(pollOnce, intervalMs);
}

export function stopClaudeTranscriptWatcher() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  files.clear();
}
