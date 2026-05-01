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
