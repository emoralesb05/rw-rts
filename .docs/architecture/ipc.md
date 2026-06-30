# IPC channels

All defined in `src/shared/ipc.ts`. Every handler in main wraps via `safeHandle()`.

## Channel reference

| Channel | Direction | Purpose |
|---|---|---|
| `rw:event-stream` | main → renderer | Push every `AgentEvent` from the bus |
| `rw:spawn-agent` | renderer → main | Start a new wielder (claude/cursor/codex/gemini) |
| `rw:send-prompt` | renderer → main | Pipe a prompt to a spawned wielder's stdin |
| `rw:kill-agent` | renderer → main | SIGTERM a wielder |
| `rw:list-units` | renderer → main | Snapshot of live spawned agents |
| `rw:install-hooks` / `uninstall-hooks` / `hooks-status` | renderer → main | Manage Claude hook installation |
| `rw:install-cursor-hooks` / `uninstall-cursor-hooks` / `cursor-hooks-status` | renderer → main | Same for Cursor |
| `rw:install-codex-hooks` / `uninstall-codex-hooks` / `codex-hooks-status` | renderer → main | Same for Codex |
| `rw:install-gemini-hooks` / `uninstall-gemini-hooks` / `gemini-hooks-status` | renderer → main | Same for Gemini, plus managed policy status |
| `rw:play-fixture` | renderer → main | Replay a recorded scenario for testing |
| `rw:resolve-permission` | renderer → main | Allow/deny a pending permission request |
| `rw:apply-permission-choice` | renderer → main | Apply a richer permission choice, optionally saving a Realmkeeper-local rule before resolving the pending request |
| `rw:list-permission-rules` / `rw:remove-permission-rule` | renderer → main | View and delete saved Realmkeeper-local permission rules |
| `rw:open-path` | renderer → main | Open a file (always tries `cursor://file/...` first) |
| `rw:list-workspace-repos` / `rw:get-settings` / `rw:save-settings` / `rw:validate-workspace-root` | renderer → main | Workspace + settings |
| `rw:load-persisted` / `rw:save-persisted` / `rw:reset-persisted` | renderer → main | Renderer state persistence |

## `safeHandle` — sender-frame guard

```ts
function safeHandle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    const expected = mainWindow?.webContents;
    if (event.sender !== expected || event.senderFrame !== expected.mainFrame) {
      throw new Error(`[realmkeeper] ipc rejected: untrusted sender for ${channel}`);
    }
    return fn(event, ...args);
  });
}
```

Rejects calls from any frame other than the main window's top-level frame. Blocks injected iframes (rendering bug, malicious markdown) from reaching `SpawnAgent`, `InstallHooks`, `SaveSettings`, `ResolvePermission`, etc.

## Adding a channel

1. Add the constant to the `IPC` object in `src/shared/ipc.ts`
2. Add the request/response type alongside it
3. Wire the handler in `src/main/index.ts` via `safeHandle(IPC.X, ...)`
4. Expose it on `window.rw` in the preload (`src/preload/index.ts`)
