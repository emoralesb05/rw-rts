/**
 * Discover candidate spawn targets — git repos under the user's
 * workspace root. Walks recursively, stops descending once a `.git`
 * is found (repos can't nest meaningfully), caps at MAX_DEPTH to
 * keep big trees bounded. Workspace root and exclusion list come
 * from ~/.keykeeper.json (settings.ts).
 *
 * Returns repos as `{ path, label }`. Label is the repo basename
 * (last path segment) — e.g. `~/Github/dreambase/dreamapp` → "dreamapp".
 */
import { readdir, stat, access } from "node:fs/promises";
import { join, basename } from "node:path";
import { loadSettings } from "./settings";

const MAX_DEPTH = 4;

export type WorkspaceRepo = {
  path: string;
  label: string;
};

async function isDir(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function hasGit(p: string): Promise<boolean> {
  try {
    await access(join(p, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function walk(
  dir: string,
  depth: number,
  out: WorkspaceRepo[],
  excludeSet: Set<string>
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (name === "node_modules") continue;
    const full = join(dir, name);
    if (!(await isDir(full))) continue;
    if (await hasGit(full)) {
      // Drop if either the basename or the full path is excluded.
      if (!excludeSet.has(name) && !excludeSet.has(full)) {
        out.push({ path: full, label: name });
      }
      continue; // don't descend into a repo
    }
    await walk(full, depth + 1, out, excludeSet);
  }
}

export async function listWorkspaceRepos(): Promise<WorkspaceRepo[]> {
  const settings = loadSettings();
  const root = settings.workspaceRoot;
  const out: WorkspaceRepo[] = [];
  if (!(await isDir(root))) return out;
  const excludeSet = new Set(settings.excludeRepos);
  await walk(root, 0, out, excludeSet);
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
