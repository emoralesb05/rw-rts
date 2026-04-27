/**
 * Cursor adapter — surfaces Organization XIII units from active Cursor sessions.
 *
 * Cursor stores per-workspace AI activity in SQLite at:
 *   ~/Library/Application Support/Cursor/User/workspaceStorage/<id>/state.vscdb
 *
 * Two relevant ItemTable keys:
 *   - aiService.generations  → composer messages (timestamps + descriptions)
 *   - aiService.prompts      → user prompts
 *
 * We poll every N seconds, track each workspace's latest seen unixMs, and emit
 * AgentEvents only for entries that are NEW since baseline (no history replay).
 */

import { homedir } from "node:os";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { bus } from "../event-bus";
import type { AgentEvent } from "@shared/events";

const WS_ROOT = join(
  homedir(),
  "Library",
  "Application Support",
  "Cursor",
  "User",
  "workspaceStorage"
);

type WorkspaceState = {
  id: string;
  dbPath: string;
  cwd: string;
  lastUnixMs: number;
  lastPromptIndex: number;
  lastFileMtimeMs: number;
};

const workspaces = new Map<string, WorkspaceState>();
let pollTimer: NodeJS.Timeout | null = null;

function listWorkspaces(): { id: string; dbPath: string; cwd: string }[] {
  if (!existsSync(WS_ROOT)) return [];
  const out: { id: string; dbPath: string; cwd: string }[] = [];
  for (const entry of readdirSync(WS_ROOT)) {
    const dbPath = join(WS_ROOT, entry, "state.vscdb");
    const wsJson = join(WS_ROOT, entry, "workspace.json");
    if (!existsSync(dbPath) || !existsSync(wsJson)) continue;
    let cwd = "";
    try {
      const j = JSON.parse(readFileSync(wsJson, "utf8"));
      const folder = String(j.folder ?? "");
      cwd = folder.replace(/^file:\/\//, "");
    } catch {
      // skip malformed
      continue;
    }
    if (!cwd) continue;
    out.push({ id: entry, dbPath, cwd });
  }
  return out;
}

function querySqlite(dbPath: string, sql: string): string {
  try {
    return execFileSync("sqlite3", [dbPath, sql], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

function readGenerations(
  dbPath: string
): Array<{ unixMs: number; uuid: string; type: string; text: string }> {
  const raw = querySqlite(
    dbPath,
    "SELECT value FROM ItemTable WHERE key = 'aiService.generations'"
  ).trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((g: Record<string, unknown>) => ({
        unixMs: Number(g.unixMs ?? 0),
        uuid: String(g.generationUUID ?? ""),
        type: String(g.type ?? ""),
        text: String(g.textDescription ?? ""),
      }))
      .filter((g) => g.unixMs > 0);
  } catch {
    return [];
  }
}

function readPrompts(dbPath: string): string[] {
  const raw = querySqlite(
    dbPath,
    "SELECT value FROM ItemTable WHERE key = 'aiService.prompts'"
  ).trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p: Record<string, unknown>) => String(p.text ?? ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function emit(ev: AgentEvent) {
  // eslint-disable-next-line no-console
  console.log(
    `[kh-rts/cursor] ${ev.kind} ${ev.sessionId} cwd=${ev.cwd} text=${(ev.payload.text ?? "").toString().slice(0, 60)}`
  );
  bus.emitAgentEvent(ev);
}

function pollWorkspace(state: WorkspaceState) {
  // Cursor uses SQLite WAL mode: live writes hit state.vscdb-wal while
  // state.vscdb mtime stays stale until checkpoint. Track the max mtime
  // of either file so we know when there's fresh activity to read.
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(state.dbPath).mtimeMs;
    try {
      mtimeMs = Math.max(mtimeMs, statSync(state.dbPath + "-wal").mtimeMs);
    } catch {
      // wal file may not exist
    }
  } catch {
    return;
  }
  if (state.lastUnixMs !== 0 && mtimeMs <= state.lastFileMtimeMs) return;
  state.lastFileMtimeMs = mtimeMs;

  const generations = readGenerations(state.dbPath);
  const prompts = readPrompts(state.dbPath);
  const sessionId = `cursor-${state.id}`;

  // First poll: establish baselines, don't emit history.
  if (state.lastUnixMs === 0) {
    state.lastUnixMs =
      generations.reduce((m, g) => Math.max(m, g.unixMs), 0) || Date.now();
    state.lastPromptIndex = prompts.length;
    return;
  }

  // New generations carry the user's prompt text + the unixMs timestamp we
  // need. aiService.prompts is just the recent-history list with no timestamps,
  // so we use generations as the source of truth and ignore prompts to avoid
  // duplicates.
  const fresh = generations
    .filter((g) => g.unixMs > state.lastUnixMs)
    .sort((a, b) => a.unixMs - b.unixMs);

  if (fresh.length === 0) return;

  if (!sessionAnnounced.has(sessionId)) {
    sessionAnnounced.add(sessionId);
    emit({
      sessionId,
      tool: "cursor",
      cwd: state.cwd,
      timestamp: Date.now(),
      kind: "session_start",
      payload: { text: "Cursor composer active" },
      source: "hook",
    });
  }

  for (const g of fresh) {
    emit({
      sessionId,
      tool: "cursor",
      cwd: state.cwd,
      timestamp: g.unixMs,
      kind: "user_prompt",
      payload: { text: g.text },
      source: "hook",
    });
    state.lastUnixMs = g.unixMs;
  }
  state.lastPromptIndex = prompts.length;
}

const sessionAnnounced = new Set<string>();

export function startCursorAdapter(intervalMs = 4000) {
  if (pollTimer) return;

  // Discover all workspaces, set baselines so we don't replay history
  for (const ws of listWorkspaces()) {
    workspaces.set(ws.id, {
      id: ws.id,
      dbPath: ws.dbPath,
      cwd: ws.cwd,
      lastUnixMs: 0,
      lastFileMtimeMs: 0,
      lastPromptIndex: 0,
    });
  }
  // eslint-disable-next-line no-console
  console.log(
    `[kh-rts/cursor] adapter started. watching ${workspaces.size} workspace(s) every ${intervalMs}ms`
  );
  for (const ws of workspaces.values()) {
    // eslint-disable-next-line no-console
    console.log(`[kh-rts/cursor]   - ${ws.cwd}`);
  }

  // Establish baselines on first tick, then poll for deltas
  pollTimer = setInterval(() => {
    for (const ws of listWorkspaces()) {
      if (!workspaces.has(ws.id)) {
        workspaces.set(ws.id, {
          id: ws.id,
          dbPath: ws.dbPath,
          cwd: ws.cwd,
          lastUnixMs: 0,
      lastFileMtimeMs: 0,
      lastPromptIndex: 0,
        });
      }
    }
    for (const state of workspaces.values()) pollWorkspace(state);
  }, intervalMs);
}

export function stopCursorAdapter() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  workspaces.clear();
  sessionAnnounced.clear();
}
