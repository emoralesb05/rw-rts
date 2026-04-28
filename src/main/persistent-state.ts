/**
 * Persistent kingdom state — wielder memory, sealed keyholes, lifetime
 * counters. JSON file in Electron's userData directory.
 *
 * Identity:
 *   - Wielder = `${tool}::${repoRoot}` (e.g. "claude::/Users/ed/Github/x").
 *     "Claude in repo X" is one wielder; "Cursor in repo X" is a
 *     different wielder. Stable across sessions.
 *   - World = repoRoot.
 *
 * Resets safely: missing/corrupt JSON falls back to EMPTY_PERSISTED with
 * `kingdomFoundedAt = Date.now()`.
 */

import { app } from "electron";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type PersistedState,
  EMPTY_PERSISTED,
} from "@shared/events";

const FILE = () => join(app.getPath("userData"), "state.json");

let cache: PersistedState | null = null;
let writeTimer: NodeJS.Timeout | null = null;

export function loadPersisted(): PersistedState {
  if (cache) return cache;
  const path = FILE();
  if (!existsSync(path)) {
    cache = { ...EMPTY_PERSISTED, kingdomFoundedAt: Date.now() };
    schedulePersist();
    return cache;
  }
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed && typeof parsed === "object" && parsed.schemaVersion === 1) {
      cache = parsed;
      return cache;
    }
    // unknown shape → start over but preserve nothing
    cache = { ...EMPTY_PERSISTED, kingdomFoundedAt: Date.now() };
    return cache;
  } catch {
    cache = { ...EMPTY_PERSISTED, kingdomFoundedAt: Date.now() };
    return cache;
  }
}

export function setPersisted(next: PersistedState): void {
  cache = next;
  schedulePersist();
}

export function resetPersisted(): PersistedState {
  cache = { ...EMPTY_PERSISTED, kingdomFoundedAt: Date.now() };
  const path = FILE();
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // ignore — best effort reset
  }
  schedulePersist();
  return cache;
}

function schedulePersist() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(persistNow, 200);
}

function persistNow() {
  if (!cache) return;
  try {
    const path = FILE();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[keykeeper] persist failed:", err);
  }
}

// Flush any pending write synchronously — call on app quit.
export function flushPersisted() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  persistNow();
}
