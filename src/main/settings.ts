/**
 * User-editable settings file at ~/.keykeeper/config.json (sibling to
 * state.json and the unix socket). Auto-created on first launch with
 * defaults. Hand-editable; reloaded on every read so changes take
 * effect immediately without restarting the app.
 *
 * Schema:
 *   {
 *     "workspaceRoot": "~/Github",
 *     "exclude": [
 *       "vercel-ai",                  // basename match
 *       "forks/vercel-ai",            // parent/repo (matches the dropdown label)
 *       "forks/*",                    // every repo whose immediate parent is "forks"
 *       "~/Github/teradata/*",        // every repo under that absolute dir
 *       "/abs/path/to/repo"           // exact absolute-path match
 *     ]
 *   }
 *
 * Back-compat:
 *   - old top-level file at ~/.keykeeper.json is read once and
 *     migrated forward; left in place as a backup the user can delete
 *   - the key "excludeRepos" is still honored if "exclude" isn't set,
 *     so older config files keep working
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { RawSettingsSchema } from "@shared/schemas";

const KEYKEEPER_DIR = join(homedir(), ".keykeeper");
const SETTINGS_PATH = join(KEYKEEPER_DIR, "config.json");
const LEGACY_SETTINGS_PATH = join(homedir(), ".keykeeper.json");

export type Settings = {
  workspaceRoot: string;
  exclude: string[];
};

function defaults(): Settings {
  return {
    workspaceRoot: join(homedir(), "Github"),
    exclude: [],
  };
}

function expandTilde(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(p === "~" ? 1 : 2));
  }
  return p;
}

export function loadSettings(): Settings {
  // Pick the read source: prefer the new path; fall back to the legacy
  // ~/.keykeeper.json once. If neither exists, write defaults to the
  // new path.
  let readPath = SETTINGS_PATH;
  if (!existsSync(SETTINGS_PATH)) {
    if (existsSync(LEGACY_SETTINGS_PATH)) {
      readPath = LEGACY_SETTINGS_PATH;
    } else {
      const def = defaults();
      try {
        mkdirSync(KEYKEEPER_DIR, { recursive: true });
        writeFileSync(
          SETTINGS_PATH,
          JSON.stringify(def, null, 2) + "\n",
          "utf8"
        );
      } catch {
        // best-effort — if HOME is read-only, just return defaults in-memory
      }
      return def;
    }
  }
  try {
    const raw = readFileSync(readPath, "utf8");
    const parsed = RawSettingsSchema.parse(JSON.parse(raw));
    const def = defaults();
    const excludeRaw = parsed.exclude ?? parsed.excludeRepos ?? def.exclude;
    const settings: Settings = {
      workspaceRoot: expandTilde(parsed.workspaceRoot ?? def.workspaceRoot),
      exclude: Array.isArray(excludeRaw)
        ? excludeRaw
            .filter((s): s is string => typeof s === "string")
            .map(expandTilde)
        : def.exclude,
    };
    // If we read from the legacy path, copy to the new path so future
    // loads find it. Don't unlink the legacy file — leave it as a
    // backup the user can delete manually.
    if (readPath === LEGACY_SETTINGS_PATH) {
      try {
        mkdirSync(KEYKEEPER_DIR, { recursive: true });
        writeFileSync(
          SETTINGS_PATH,
          JSON.stringify(settings, null, 2) + "\n",
          "utf8"
        );
      } catch {
        // best-effort
      }
    }
    return settings;
  } catch {
    // Malformed file — log once, fall through to defaults. Don't
    // overwrite the user's broken file; let them fix it.

    console.warn(`[keykeeper] failed to parse ${readPath}; using defaults`);
    return defaults();
  }
}

export function settingsPath(): string {
  return SETTINGS_PATH;
}

/** Persist a settings object to disk. Tilde-expansion runs on
 * workspaceRoot before write so the file always stores absolute paths
 * — exclude patterns keep their original form (the user wrote them). */
export function saveSettings(next: Settings): Settings {
  const cleaned: Settings = {
    workspaceRoot: expandTilde(next.workspaceRoot ?? defaults().workspaceRoot),
    exclude: Array.isArray(next.exclude)
      ? next.exclude
          .map((s) => (typeof s === "string" ? s.trim() : ""))
          .filter((s) => s.length > 0)
      : [],
  };
  mkdirSync(KEYKEEPER_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(cleaned, null, 2) + "\n", "utf8");
  return cleaned;
}

/** Validate a path as a workspace-root candidate. Used for the
 * Settings UI's live "is this dir okay?" indicator. */
export function validateWorkspaceRoot(p: string): {
  valid: boolean;
  expanded: string;
  reason?: string;
} {
  const expanded = expandTilde((p ?? "").trim());
  if (!expanded) {
    return { valid: false, expanded, reason: "empty" };
  }
  if (!existsSync(expanded)) {
    return { valid: false, expanded, reason: "not-found" };
  }
  try {
    const s = statSync(expanded);
    if (!s.isDirectory()) {
      return { valid: false, expanded, reason: "not-a-directory" };
    }
  } catch {
    return { valid: false, expanded, reason: "stat-failed" };
  }
  return { valid: true, expanded };
}

/**
 * Decide whether a repo at `path` (with computed `label` and `name`)
 * should be filtered out by the exclude list. Matches:
 *
 *   - basename: "vercel-ai" matches name === "vercel-ai"
 *   - label:    "forks/vercel-ai" matches label === "forks/vercel-ai"
 *   - dir-glob: "forks/*" matches any label whose first segment is forks,
 *               or any path under any dir named forks
 *   - abs-glob: "/abs/path/* " or "~/Github/foo/*" matches any path under
 *               that prefix
 *   - abs-path: "/abs/path/to/repo" matches path === pattern
 */
export function isExcluded(
  repo: { path: string; label: string; name: string },
  patterns: string[]
): boolean {
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      if (prefix.startsWith("/")) {
        // Absolute prefix — match against full path.
        if (repo.path === prefix || repo.path.startsWith(prefix + "/"))
          return true;
      } else {
        // Relative prefix — match label first segment(s) OR any
        // path segment chain (so "forks/*" hits both label "forks/x"
        // and a deeper path that happens to traverse a "forks" dir).
        if (repo.label === prefix || repo.label.startsWith(prefix + "/"))
          return true;
        if (repo.path.includes(`/${prefix}/`)) return true;
      }
      continue;
    }
    if (pattern.startsWith("/")) {
      if (repo.path === pattern) return true;
      continue;
    }
    if (repo.name === pattern) return true;
    if (repo.label === pattern) return true;
  }
  return false;
}
