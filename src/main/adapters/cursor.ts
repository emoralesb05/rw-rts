/**
 * Cursor passive monitor.
 *
 * Cursor stores chat bubbles in the **global** SQLite db at:
 *   ~/Library/Application Support/Cursor/User/globalStorage/state.vscdb
 *
 * Two relevant cursorDiskKV key shapes:
 *   - bubbleId:<composerId>:<bubbleId>  → JSON {type:1|2, text, createdAt, ...}
 *     type 1 = user, type 2 = assistant
 *   - composer.composerHeaders (in ItemTable) → array of chat session metadata
 *     including {composerId, name, workspaceIdentifier.uri.fsPath}
 *
 * Strategy: snapshot existing bubble keys on startup as the baseline, then
 * each poll find new keys (since-baseline), parse their value, look up the
 * owning workspace via composerHeaders, and emit AgentEvents.
 */

import { homedir } from "node:os";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { bus } from "../event-bus";
import type { AgentEvent } from "@shared/events";

const GLOBAL_DB = join(
  homedir(),
  "Library",
  "Application Support",
  "Cursor",
  "User",
  "globalStorage",
  "state.vscdb"
);

const sessionsAnnounced = new Set<string>();
const composerCwd = new Map<string, string>();
const emittedKinds = new Map<string, Set<string>>(); // key → kinds already emitted
const pendingKeys = new Map<string, number>(); // key → first-seen ms (waiting for result)
const PENDING_TTL_MS = 5 * 60 * 1000;
let lastRowId = 0;
let lastGlobalMtime = 0;
let pollTimer: NodeJS.Timeout | null = null;

function querySqlite(dbPath: string, sql: string): string {
  try {
    return execFileSync("sqlite3", [dbPath, sql], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

function querySqliteJson<T = unknown>(dbPath: string, sql: string): T[] {
  try {
    const out = execFileSync("sqlite3", ["-json", dbPath, sql], {
      encoding: "utf8",
      maxBuffer: 200 * 1024 * 1024,
    });
    if (!out.trim()) return [];
    return JSON.parse(out);
  } catch {
    return [];
  }
}

function refreshComposerHeaders() {
  const rows = querySqliteJson<{ value: string }>(
    GLOBAL_DB,
    "SELECT value FROM ItemTable WHERE key='composer.composerHeaders'"
  );
  const raw = rows[0]?.value ?? "";
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    const list = parsed?.allComposers;
    if (!Array.isArray(list)) return;
    for (const c of list) {
      const id = c?.composerId;
      const cwd = c?.workspaceIdentifier?.uri?.fsPath;
      if (typeof id === "string" && typeof cwd === "string") {
        composerCwd.set(id, cwd);
      }
    }
  } catch {
    // ignore
  }
}

function dbMtimeMs(): number {
  let m = 0;
  try {
    m = statSync(GLOBAL_DB).mtimeMs;
  } catch {
    return 0;
  }
  try {
    m = Math.max(m, statSync(GLOBAL_DB + "-wal").mtimeMs);
  } catch {
    // wal may not exist
  }
  return m;
}

type BubbleRow = {
  key: string;
  composerId: string;
  bubbleId: string;
  type: number;
  text: string;
  createdAtMs: number;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
};

function fetchBubblesByKeys(keys: string[]): BubbleRow[] {
  if (keys.length === 0) return [];
  const escaped = keys.map((k) => `'${k.replace(/'/g, "''")}'`).join(",");
  const rows = querySqliteJson<{ key: string; value: string }>(
    GLOBAL_DB,
    `SELECT key, value FROM cursorDiskKV WHERE key IN (${escaped})`
  );
  return parseBubbleRows(rows);
}

function fetchMaxRowid(): number {
  const rows = querySqliteJson<{ m: number }>(
    GLOBAL_DB,
    "SELECT MAX(rowid) AS m FROM cursorDiskKV"
  );
  return Number(rows[0]?.m ?? 0);
}

function fetchNewBubbles(sinceRowId: number): (BubbleRow & { rowid: number })[] {
  const rows = querySqliteJson<{ rowid: number; key: string; value: string }>(
    GLOBAL_DB,
    `SELECT rowid, key, value FROM cursorDiskKV WHERE rowid > ${sinceRowId} AND key LIKE 'bubbleId:%' ORDER BY rowid ASC`
  );
  return parseBubbleRows(rows);
}

function parseBubbleRows(
  rows: { rowid?: number; key: string; value: string }[]
): (BubbleRow & { rowid: number })[] {
  const out: (BubbleRow & { rowid: number })[] = [];
  for (const r of rows) {
    const parts = r.key.split(":");
    if (parts.length < 3) continue;
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(r.value);
    } catch {
      continue;
    }
    if (!parsed) continue;
    const text = String(parsed.text ?? "");
    const type = Number(parsed.type ?? 0);
    const createdAtIso = String(parsed.createdAt ?? "");
    const createdAtMs = createdAtIso ? Date.parse(createdAtIso) : Date.now();
    const tfd = (parsed.toolFormerData as Record<string, unknown>) ?? null;
    let toolName: string | undefined;
    let toolInput: unknown;
    let toolOutput: unknown;
    if (tfd && typeof tfd === "object") {
      toolName = typeof tfd.name === "string" ? tfd.name : undefined;
      const tryParse = (v: unknown) => {
        if (typeof v !== "string" || !v) return v;
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      };
      toolInput = tryParse(tfd.params);
      toolOutput = tryParse(tfd.result);
    }
    if (!text.trim() && !toolName) continue;
    out.push({
      key: r.key,
      composerId: parts[1],
      bubbleId: parts.slice(2).join(":"),
      type,
      text,
      createdAtMs,
      toolName,
      toolInput,
      toolOutput,
      rowid: Number(r.rowid ?? 0),
    });
  }
  return out;
}

function emit(ev: AgentEvent) {
  // eslint-disable-next-line no-console
  console.log(
    `[kh-rts/cursor] ${ev.kind} ${ev.sessionId} ${(ev.payload.name ?? "").toString()} ${(ev.payload.text ?? "").toString().slice(0, 60).replace(/\n/g, " ")}`
  );
  bus.emitAgentEvent(ev);
}

function processBubble(row: BubbleRow & { rowid: number }) {
  const cwd = composerCwd.get(row.composerId) ?? process.cwd();
  const sessionId = `cursor-${row.composerId}`;
  if (!sessionsAnnounced.has(sessionId)) {
    sessionsAnnounced.add(sessionId);
    emit({
      sessionId,
      tool: "cursor",
      cwd,
      timestamp: row.createdAtMs,
      kind: "session_start",
      payload: { text: "Cursor chat" },
      source: "hook",
    });
  }
  let kinds = emittedKinds.get(row.key);
  if (!kinds) {
    kinds = new Set();
    emittedKinds.set(row.key, kinds);
  }
  if (row.toolName) {
    if (!kinds.has("tool_use")) {
      emit({
        sessionId,
        tool: "cursor",
        cwd,
        timestamp: row.createdAtMs,
        kind: "tool_use",
        payload: { name: row.toolName, input: row.toolInput },
        source: "hook",
      });
      kinds.add("tool_use");
    }
    if (row.toolOutput !== undefined && !kinds.has("tool_result")) {
      emit({
        sessionId,
        tool: "cursor",
        cwd,
        timestamp: row.createdAtMs + 1,
        kind: "tool_result",
        payload: { output: row.toolOutput },
        source: "hook",
      });
      kinds.add("tool_result");
      pendingKeys.delete(row.key);
    } else if (row.toolOutput === undefined) {
      if (!pendingKeys.has(row.key)) pendingKeys.set(row.key, Date.now());
    }
  } else if (row.text.trim()) {
    const kind = (row.type === 1 ? "user_prompt" : "assistant_text") as AgentEvent["kind"];
    if (!kinds.has(kind)) {
      emit({
        sessionId,
        tool: "cursor",
        cwd,
        timestamp: row.createdAtMs,
        kind,
        payload: { text: row.text },
        source: "hook",
      });
      kinds.add(kind);
    }
  }
}

function pollOnce() {
  const m = dbMtimeMs();
  if (m === 0) return;
  // First poll: establish baseline (don't replay history)
  if (lastRowId === 0) {
    refreshComposerHeaders();
    lastRowId = fetchMaxRowid();
    lastGlobalMtime = m;
    // eslint-disable-next-line no-console
    console.log(
      `[kh-rts/cursor] baseline established. lastRowId=${lastRowId}, ${composerCwd.size} composers`
    );
    return;
  }

  // 1. New rows since last poll (incremental — fast even with 100K+ bubbles).
  const newRows = fetchNewBubbles(lastRowId);
  if (newRows.length > 0) {
    let unknownComposer = false;
    for (const row of newRows) {
      if (row.rowid > lastRowId) lastRowId = row.rowid;
      if (!composerCwd.has(row.composerId)) unknownComposer = true;
      processBubble(row);
    }
    // Only refresh composer headers (3+ second blocking query on a 2.9GB db)
    // when we encounter a chat we haven't seen yet. Skipping the refresh on
    // every poll is the difference between "snappy" and "frozen".
    if (unknownComposer) refreshComposerHeaders();
  }

  // 2. Re-fetch pending bubbles (tool calls awaiting result).
  if (pendingKeys.size > 0) {
    const cutoff = Date.now() - PENDING_TTL_MS;
    const stale: string[] = [];
    for (const [k, t] of pendingKeys) if (t < cutoff) stale.push(k);
    for (const k of stale) pendingKeys.delete(k);
    if (pendingKeys.size > 0) {
      const refreshed = fetchBubblesByKeys([...pendingKeys.keys()]);
      for (const row of refreshed) {
        processBubble({ ...row, rowid: 0 });
      }
    }
  }

  lastGlobalMtime = m;
}

export function startCursorAdapter(intervalMs = 4000) {
  if (pollTimer) return;
  if (!existsSync(GLOBAL_DB)) {
    // eslint-disable-next-line no-console
    console.log(`[kh-rts/cursor] global db not found at ${GLOBAL_DB}; cursor monitor disabled`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[kh-rts/cursor] adapter started, polling every ${intervalMs}ms`);
  pollOnce();
  pollTimer = setInterval(pollOnce, intervalMs);
}

export function stopCursorAdapter() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  sessionsAnnounced.clear();
  composerCwd.clear();
  emittedKinds.clear();
  pendingKeys.clear();
  lastRowId = 0;
  lastGlobalMtime = 0;
}

// Compatibility: the old API exported listWorkspaces; kept here as a stub for
// any code that still imports it.
export function listWorkspaces() {
  return [...composerCwd.entries()].map(([id, cwd]) => ({ id, cwd }));
}
