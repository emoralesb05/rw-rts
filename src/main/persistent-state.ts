/**
 * Persistent kingdom state — wielder memory, sealed realms, lifetime
 * counters. JSON file in `~/.realmkeeper/state.json` (sibling to
 * `~/.claude/`, `~/.cursor/`, `~/.codex/`).
 *
 * Identity:
 *   - Wielder = `${tool}::${repoRoot}` (e.g. "claude::/Users/ed/Github/x").
 *     "Claude in repo X" is one wielder; "Cursor in repo X" is a
 *     different wielder. Stable across sessions.
 *   - World = repoRoot.
 *
 * Resets safely: missing/corrupt JSON falls back to EMPTY_PERSISTED with
 * `kingdomFoundedAt = Date.now()`.
 *
 * Back-compat: if the legacy path exists at
 * `~/Library/Application Support/realmkeeper/state.json` (Electron's
 * `userData/state.json` from before the move) and the new path does
 * not, read the legacy file once, write to the new path, and leave the
 * legacy file alone.
 */

import { app } from "electron";
import { homedir } from "node:os";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { type PersistedState, EMPTY_PERSISTED } from "@shared/events";
import { PersistedStateSchema } from "@shared/schemas";

const REALMKEEPER_DIR = join(homedir(), ".realmkeeper");
const FILE = () => join(REALMKEEPER_DIR, "state.json");
const LEGACY_FILE = () => join(app.getPath("userData"), "state.json");

let cache: PersistedState | null = null;
let writeTimer: NodeJS.Timeout | null = null;

export function loadPersisted(): PersistedState {
  if (cache) return cache;
  const path = FILE();
  // Back-compat: if the new path doesn't exist but the legacy
  // userData/state.json does, read from there once. Schedule a write
  // to the new path so subsequent loads find it. Don't unlink the
  // legacy file — leave it as a backup the user can delete manually.
  let readPath = path;
  if (!existsSync(path)) {
    const legacy = LEGACY_FILE();
    if (existsSync(legacy)) {
      readPath = legacy;
    } else {
      cache = { ...EMPTY_PERSISTED, kingdomFoundedAt: Date.now() };
      schedulePersist();
      return cache;
    }
  }
  try {
    const raw = readFileSync(readPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown> & {
      schemaVersion?: number;
    };
    if (!parsed || typeof parsed !== "object") {
      cache = { ...EMPTY_PERSISTED, kingdomFoundedAt: Date.now() };
      return cache;
    }
    const migrated = migrate(parsed);
    const result = PersistedStateSchema.safeParse(migrated);
    if (!result.success) {
      cache = { ...EMPTY_PERSISTED, kingdomFoundedAt: Date.now() };
    } else {
      cache = result.data;
    }
    // If we read from the legacy path, write to the new path now so
    // future loads don't keep falling back.
    if (readPath !== path) schedulePersist();
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
    console.error("[realmkeeper] persist failed:", err);
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
