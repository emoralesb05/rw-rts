# Workspace, settings & repo discovery

How Realmkeeper finds repos to spawn into, and how the user configures that.

## Settings file

User-editable JSON at `~/.realmkeeper/config.json`. Auto-created with defaults on first launch. **Reloaded on every read** — changes take effect immediately, no restart.

```json
{
  "workspaceRoot": "~/Github",
  "exclude": [
    "vercel-ai",                 // basename match
    "forks/vercel-ai",           // parent/repo match (= dropdown label)
    "forks/*",                   // every repo whose immediate parent is "forks"
    "~/Github/teradata/*",       // every repo under that absolute dir
    "/abs/path/to/repo"          // exact absolute-path match
  ]
}
```

- `workspaceRoot` is tilde-expanded on load and write
- `exclude` patterns are matched against `{path, label, name}` of each candidate repo
- Back-compat: the old `excludeRepos` key is still honored if `exclude` isn't set
- Malformed JSON → falls back to defaults in-memory, **doesn't overwrite the user's broken file** (let them fix it)

Source: `src/main/settings.ts`. IPC: `rw:get-settings` / `rw:save-settings` / `rw:validate-workspace-root`.

## Workspace scanning

`listWorkspaceRepos()` in `src/main/workspace-scan.ts`:

1. Walks the workspace root recursively
2. Stops descending once a `.git` is found (repos can't nest meaningfully)
3. Caps at `MAX_DEPTH = 4` to keep big trees bounded
4. Skips dotfiles and `node_modules`
5. Applies `exclude` patterns from settings
6. Returns `{ path, label }` per repo, sorted by label

Label convention: `parent/repo` if the repo's parent isn't the workspace root, otherwise just `repo`. Compact for the common `~/Github/<org>/<repo>` shape.

## Repo-root resolution

`resolveRepoRoot(cwd)` in `src/main/repo-root.ts` — used to key wielders by **repo**, not by every distinct working directory:

1. **Walk up** looking for `.git/` (32-step bound)
2. **Fallback** to `~/Github/<owner>/<repo>` shape if no `.git` ancestor — keeps non-git scratch dirs from each becoming their own world
3. Cached by absolute cwd (repo roots don't change during a session)

Why this matters: a wielder spawned at `~/repo/` and one observed at `~/repo/subdir/` should be the **same world**. Without `repoRoot` stable identity, standing-orders would fail to rebind across cwd shifts within a repo (we hit this bug — see `state.md` § identity stability).

## Workspace-root validation

`validateWorkspaceRoot(p)` returns `{valid, expanded, reason?}`. Used by the Settings UI for live feedback.

| Reason | Meaning |
|---|---|
| `empty` | path was blank |
| `not-found` | expanded path doesn't exist on disk |
| `not-a-directory` | path exists but isn't a dir |
| `stat-failed` | permission denied or other I/O |

Renderer can show "✓ valid" / "✗ <reason>" without touching disk twice.

## Invariants

- Settings file is always overwriteable by the user — realmkeeper hand-edit-friendly is a feature
- We never silently delete an unparseable settings file
- `exclude` patterns store the user's original form (not tilde-expanded) so the file stays human-readable
- Workspace scans are cheap (cached repo-roots, bounded depth) — safe to call from the dispatch dialog on every open
