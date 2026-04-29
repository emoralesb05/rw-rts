/**
 * Discover candidate spawn targets — git repos under the user's
 * workspace root (default `~/Github`). Walks recursively, stops
 * descending once a `.git` is found (repos can't nest meaningfully),
 * caps at MAX_DEPTH to keep big trees bounded.
 *
 * Returns repos as `{ path, label }`. Label is the repo basename
 * (last path segment) — e.g. `~/Github/dreambase/dreamapp` → "dreamapp".
 */
import { readdir, stat, access } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const DEFAULT_WORKSPACE = join(homedir(), "Github");
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
  out: WorkspaceRepo[]
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
      out.push({ path: full, label: basename(full) });
      continue; // don't descend into a repo
    }
    await walk(full, depth + 1, out);
  }
}

export async function listWorkspaceRepos(
  root: string = DEFAULT_WORKSPACE
): Promise<WorkspaceRepo[]> {
  const out: WorkspaceRepo[] = [];
  if (!(await isDir(root))) return out;
  await walk(root, 0, out);
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export const WORKSPACE_ROOT = DEFAULT_WORKSPACE;
