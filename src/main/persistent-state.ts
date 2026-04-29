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
    const parsed = JSON.parse(raw) as Record<string, unknown> & {
      schemaVersion?: number;
    };
    if (!parsed || typeof parsed !== "object") {
      cache = { ...EMPTY_PERSISTED, kingdomFoundedAt: Date.now() };
      return cache;
    }
    cache = migrate(parsed);
    if (cache.schemaVersion !== EMPTY_PERSISTED.schemaVersion) {
      // Migration didn't recognize the version — reset.
      cache = { ...EMPTY_PERSISTED, kingdomFoundedAt: Date.now() };
    }
    return cache;
  } catch {
    cache = { ...EMPTY_PERSISTED, kingdomFoundedAt: Date.now() };
    return cache;
  }
}

/**
 * Forward-migrate older schemas to the current shape. Each step is
 * additive — older fields are preserved; missing fields default. If
 * we ever need to break a field, do it as a v→v+1 step that reshapes.
 */
function migrate(parsed: Record<string, unknown>): PersistedState {
  let out = parsed as Record<string, unknown> & { schemaVersion?: number };
  if (out.schemaVersion === 1) {
    // v1 → v2: add standingOrders.
    out = { ...out, schemaVersion: 2, standingOrders: [] };
  }
  return out as unknown as PersistedState;
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
