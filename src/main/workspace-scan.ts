/**
 * Discover candidate spawn targets — git repos under the user's
 * workspace root. Walks recursively, stops descending once a `.git`
 * is found (repos can't nest meaningfully), caps at MAX_DEPTH to
 * keep big trees bounded. Workspace root and exclusion list come
 * from ~/.keykeeper.json (settings.ts).
 *
 * Returns repos as `{ path, label }`. Label is `parent/repo` when
 * the repo lives in a subdir of the workspace root (which is the
 * common GitHub-style `~/Github/<org>/<repo>` shape), and just
 * `repo` when it sits directly under the root.
 */
import { readdir, stat, access } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { loadSettings, isExcluded } from "./settings";

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
  patterns: string[],
  workspaceRoot: string
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
      const label = labelFor(full, workspaceRoot);
      if (!isExcluded({ path: full, label, name }, patterns)) {
        out.push({ path: full, label });
      }
      continue; // don't descend into a repo
    }
    await walk(full, depth + 1, out, patterns, workspaceRoot);
  }
}

/** "<parent>/<repo>" if the repo's parent isn't the workspace root,
 * otherwise just "<repo>". Keeps the dropdown compact for the common
 * `~/Github/<org>/<repo>` shape and degrades gracefully for repos
 * that live deeper or at the root. */
function labelFor(repoPath: string, workspaceRoot: string): string {
  const repo = basename(repoPath);
  const parent = dirname(repoPath);
  if (parent === workspaceRoot) return repo;
  return `${basename(parent)}/${repo}`;
}

export async function listWorkspaceRepos(): Promise<WorkspaceRepo[]> {
  const settings = loadSettings();
  const root = settings.workspaceRoot;
  const out: WorkspaceRepo[] = [];
  if (!(await isDir(root))) return out;
  await walk(root, 0, out, settings.exclude, root);
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
