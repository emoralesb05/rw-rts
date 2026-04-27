/**
 * Resolve a cwd to its repo root so the renderer keys worlds by repo, not
 * by every distinct working directory. Two strategies, in order:
 *
 *   1. Walk up looking for .git/ — handles every git repo correctly.
 *   2. Fall back to the ~/Github/<owner>/<repo> shape when no .git is found
 *      (rare, but keeps non-git scratch dirs from each becoming their own
 *      world).
 *
 * Cached by absolute cwd. Repo roots don't change during a session.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const GITHUB_PREFIX = `${HOME}/Github/`;

const _cache = new Map<string, string>();

export function resolveRepoRoot(cwd: string): string {
  const abs = resolve(cwd);
  const cached = _cache.get(abs);
  if (cached !== undefined) return cached;

  // Walk up to nearest .git/ — bounded so a malformed path can't loop forever.
  let dir = abs;
  for (let i = 0; i < 32; i++) {
    if (existsSync(`${dir}/.git`)) {
      _cache.set(abs, dir);
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // No .git ancestor — if we're under ~/Github, take owner/repo as the unit.
  if (abs.startsWith(GITHUB_PREFIX)) {
    const segs = abs.slice(GITHUB_PREFIX.length).split("/");
    if (segs.length >= 2) {
      const guess = `${GITHUB_PREFIX}${segs[0]}/${segs[1]}`;
      _cache.set(abs, guess);
      return guess;
    }
    if (segs.length === 1 && segs[0]) {
      const guess = `${GITHUB_PREFIX}${segs[0]}`;
      _cache.set(abs, guess);
      return guess;
    }
  }

  _cache.set(abs, abs);
  return abs;
}
