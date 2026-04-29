/**
 * User-editable settings file at ~/.keykeeper.json. Auto-created on
 * first launch with defaults. Hand-editable; reloaded on every read so
 * changes take effect immediately without restarting the app.
 *
 * Schema (kept minimal — extend as new settings appear):
 *   {
 *     "workspaceRoot": "~/Github",       // default
 *     "excludeRepos": ["fork-foo", "..." ]  // default: []
 *   }
 *
 * excludeRepos entries match either the repo basename (e.g. "vercel-ai")
 * or the full absolute path. Substring isn't supported — keep it
 * predictable.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SETTINGS_PATH = join(homedir(), ".keykeeper.json");

export type Settings = {
  workspaceRoot: string;
  excludeRepos: string[];
};

function defaults(): Settings {
  return {
    workspaceRoot: join(homedir(), "Github"),
    excludeRepos: [],
  };
}

function expandTilde(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(p === "~" ? 1 : 2));
  }
  return p;
}

export function loadSettings(): Settings {
  if (!existsSync(SETTINGS_PATH)) {
    const def = defaults();
    try {
      writeFileSync(SETTINGS_PATH, JSON.stringify(def, null, 2) + "\n", "utf8");
    } catch {
      // best-effort — if HOME is read-only, just return defaults in-memory
    }
    return def;
  }
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const def = defaults();
    return {
      workspaceRoot: expandTilde(parsed.workspaceRoot ?? def.workspaceRoot),
      excludeRepos: Array.isArray(parsed.excludeRepos)
        ? parsed.excludeRepos.filter((s): s is string => typeof s === "string")
        : def.excludeRepos,
    };
  } catch {
    // Malformed file — log once, fall through to defaults. Don't
    // overwrite the user's broken file; let them fix it.
    // eslint-disable-next-line no-console
    console.warn(`[keykeeper] failed to parse ${SETTINGS_PATH}; using defaults`);
    return defaults();
  }
}

export function settingsPath(): string {
  return SETTINGS_PATH;
}
