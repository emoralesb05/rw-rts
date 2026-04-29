/**
 * User-editable settings file at ~/.keykeeper.json. Auto-created on
 * first launch with defaults. Hand-editable; reloaded on every read so
 * changes take effect immediately without restarting the app.
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
 * Back-compat: the old key "excludeRepos" is still honored if "exclude"
 * isn't set, so older config files keep working.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SETTINGS_PATH = join(homedir(), ".keykeeper.json");

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

type RawSettings = Partial<Settings> & { excludeRepos?: string[] };

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
    const parsed = JSON.parse(raw) as RawSettings;
    const def = defaults();
    const excludeRaw = parsed.exclude ?? parsed.excludeRepos ?? def.exclude;
    return {
      workspaceRoot: expandTilde(parsed.workspaceRoot ?? def.workspaceRoot),
      exclude: Array.isArray(excludeRaw)
        ? excludeRaw
            .filter((s): s is string => typeof s === "string")
            .map(expandTilde)
        : def.exclude,
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
        if (repo.path === prefix || repo.path.startsWith(prefix + "/")) return true;
      } else {
        // Relative prefix — match label first segment(s) OR any
        // path segment chain (so "forks/*" hits both label "forks/x"
        // and a deeper path that happens to traverse a "forks" dir).
        if (repo.label === prefix || repo.label.startsWith(prefix + "/")) return true;
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
