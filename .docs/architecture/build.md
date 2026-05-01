# Build & dev

## Stack

- **Bun** — package manager + script runner (`bun run dev`)
- **Electron 41** + **electron-vite** — wraps Vite for main / preload / renderer
- **Vite** — bundler, with `@vitejs/plugin-react` for JSX and `@tailwindcss/vite` for utility classes
- **TypeScript** — split tsconfigs (`tsconfig.node.json` for main+preload, `tsconfig.web.json` for renderer)
- **Phaser 4** — game engine (canvas)
- **React 19** — DOM UI (HUD, panels)
- **Zustand** — state store (one store, used by both Phaser and React)
- **Streamdown** + plugins (code/mermaid/math/cjk) — markdown rendering in conversation streams

## Scripts

```bash
bun run dev           # electron-vite dev: Vite + watch + spawn Electron
bun run build         # electron-vite build: production artifacts under out/
bun run start         # electron-vite preview: run the built app
bun run typecheck     # both typecheck:node and typecheck:web
```

The dev command starts Vite, builds main+preload to `out/`, then spawns Electron with `out/main/index.js` as the entry. CDP is exposed at `localhost:9222` in dev (see `src/main/index.ts` `app.commandLine.appendSwitch('remote-debugging-port', '9222')`).

## What hot-reloads (and what doesn't)

| Change | Behavior |
|---|---|
| Renderer code (`src/renderer/`) | HMR via Vite — instant, state preserved |
| Main code (`src/main/`) | electron-vite rebuilds `out/main/`, but **Electron does not auto-relaunch** — you must Cmd-Q and re-run `bun run dev` |
| Preload (`src/preload/`) | Same as main — rebuild but no relaunch |
| Shared types (`src/shared/`) | TypeScript-only. Hot-reloads in renderer if it imports them; main needs relaunch |

This is the single biggest dev friction. A typical session: edit renderer → see change immediately. Edit main (e.g. bridge logic) → kill, relaunch, re-test.

## Aliases

Configured in `electron.vite.config.ts`:

```ts
"@"        → src/renderer/src   (renderer only)
"@shared"  → src/shared         (everywhere)
```

Use `@shared/events` etc. throughout. Don't reach into `src/main/` from the renderer or vice versa.

## Debugging

- **Renderer**: open Electron's DevTools (Cmd-Option-I) or attach Chrome DevTools to `localhost:9222`
- **Main process**: `console.log` lands in the terminal that ran `bun run dev`. For breakpoints, run with `--inspect=9223` and attach Node Inspector
- **Capture frame**: `kill -SIGUSR1 <electron-pid>` writes `/tmp/keykeeper-frame.png` (see `src/main/index.ts`)
- **Bridge logs**: every hook fire shows up as `[keykeeper/bridge] hook <Event> sid=<short-id> → <tool>/<kind>` in the dev log
- **agent-browser**: connect to CDP at port 9222 for scripted UI inspection — see `.claude/skills/agent-browser/`

## Build outputs

```
out/
├── main/index.js          (electron entry — node modules externalized)
├── preload/index.js       (preload bridge)
└── renderer/              (static SPA: index.html + assets)
```

`main` field in `package.json` points at `out/main/index.js` so `electron .` works from the project root.

## Packaging (.app + .dmg)

`electron-builder` 26.x bundles `out/` into a distributable macOS `.app` (and optionally a `.dmg`). Config lives in `package.json` under the `build` field.

| Script | Output | Use |
|---|---|---|
| `bun run pack` | `dist/mac-arm64/Keykeeper.app` (unpacked, ~213 MB) | Fast iteration; no DMG compression |
| `bun run dist` | Same `.app` + `dist/Keykeeper-<version>-arm64.dmg` (~175 MB) | Distribution-ready single-file artifact |

### Why these specific config choices

- **`asar: true`** — main/preload/renderer JS bundled into one archive (`Contents/Resources/app.asar`). Faster app load than thousands of small files.
- **`extraResources: bin/keykeeper-hook` → `Contents/Resources/bin/`** — the hook script needs to be a real executable on disk, not inside the asar archive (you can't `chmod +x` a file inside asar). `extraResources` puts it at the path `getBundledScriptPath()` in `hook-installer.ts` resolves to in packaged mode (`app.getAppPath() + ".." + "bin/keykeeper-hook"`).
- **`mac.target: ["dmg", "dir"]`, `arch: ["arm64"]`** — Apple Silicon only for now (saves build time vs universal). Add `"x64"` to `arch` when an Intel Mac is in scope.
- **`identity: null`, `hardenedRuntime: false`, `gatekeeperAssess: false`** — code signing is skipped. Apple Developer ID required for a signed build (~$99/year). Unsigned `.app`s show a Gatekeeper "developer cannot be verified" warning on first launch — bypass with right-click → Open, or run `xattr -cr <app>` once to clear quarantine.
- **`darkModeSupport: true`** — required for proper window styling on modern macOS.

### How `bin/keykeeper-hook` reaches users

```
Repo: bin/keykeeper-hook
  ↓ extraResources copy at build time
Bundle: Keykeeper.app/Contents/Resources/bin/keykeeper-hook
  ↓ syncHookScript() on app boot (cp + chmod +x)
User dir: ~/.keykeeper/keykeeper-hook
  ↓ hook installer writes this path to user configs
~/.claude/settings.json, ~/.cursor/hooks.json, ~/.codex/config.toml
```

The user-dir copy is what Claude/Cursor/Codex actually invoke. Repo and `.app` location can both change without breaking installed hooks.

### Icon

`build/icon.png` — single 1024×1024 PNG. electron-builder generates `Contents/Resources/icon.icns` (multi-resolution: 16, 32, 64, 128, 256, 512, 1024 + retina) on every build. Missing source → Electron's default icon used + a build warning.

### Other generated artifacts

- `dist/Keykeeper-<version>-arm64.dmg.blockmap` — delta-update manifest. Unused since we don't ship auto-updates. Safe to ignore.
- `dist/latest-mac.yml` — auto-update manifest for `electron-updater`. Same — unused.
- `dist/builder-debug.yml` — last build's electron-builder config snapshot. Useful when debugging packaging issues.

### Future enhancements (deferred)

- **Code signing + notarization** — needs Apple Developer ID. Fixes the Gatekeeper warning, allows hosted distribution. ~½ day to wire up via electron-builder's `mac.identity` + notarization config.
- **Universal binary** — add `"x64"` to `arch` for Intel Mac support. Doubles build time and artifact size.
- **Auto-update** — `electron-updater` + a hosted release feed (GitHub Releases / S3). Would also need signed builds. Out of scope for personal-tidy distribution.
- **Bundle size reduction** — biggest win is code-splitting Mermaid/Shiki/KaTeX out of the cold-start chunk (see [`../vision.md`](../vision.md) § Known gaps). Would shave 30-50 MB.

## Version constraints

- **Electron 41** — latest stable as of 2026-Q1; required for current Phaser 4 + React 19 compat
- **Phaser 4** — major version jump from Phaser 3; scene API and renderer differ
- **React 19** — concurrent mode, new fiber. Some libraries (incl. some Streamdown plugins) lagged briefly during the transition
- **Bun** — chosen over npm/pnpm for install speed and ts script execution. Scripts in `package.json` are bun-runnable but should also work with `npm run` if needed

## Skills available in this repo

`.claude/skills/agent-browser/` — read-only browser/electron automation skill. Useful for scripted UI inspection during dev (hits the same CDP port). See its README before invoking.

## Logging conventions

All console output in main + renderer should use the `[keykeeper/<component>]` prefix so dev-log greps are productive:

```
[keykeeper/bridge] hook PreToolUse sid=abc123de → claude/tool_use
[keykeeper/claude-transcript] watcher started, polling every 2000ms
[keykeeper/codex-transcript] watcher started, polling every 2000ms
[keykeeper] hook bridge listening on /Users/ed/.keykeeper/keykeeper.sock
```

Component names match the file/module: `bridge`, `claude-transcript`, `codex-transcript`, `agent-manager`, etc. Bare `[keykeeper]` is for top-level lifecycle (boot/shutdown).

Don't `console.log` from the renderer for routine events — use the activity log or wielder messages tab instead. Renderer logs should only fire for actual diagnostic concerns (state corruption, IPC errors).
