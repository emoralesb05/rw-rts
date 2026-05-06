# IPC channels

All defined in `src/shared/ipc.ts`. Every handler in main wraps via `safeHandle()`.

## Channel reference

| Channel | Direction | Purpose |
|---|---|---|
| `kh:event-stream` | main → renderer | Push every `AgentEvent` from the bus |
| `kh:spawn-agent` | renderer → main | Start a new wielder (claude/cursor/codex/gemini) |
| `kh:send-prompt` | renderer → main | Pipe a prompt to a spawned wielder's stdin |
| `kh:kill-agent` | renderer → main | SIGTERM a wielder |
| `kh:list-units` | renderer → main | Snapshot of live spawned agents |
| `kh:install-hooks` / `uninstall-hooks` / `hooks-status` | renderer → main | Manage Claude hook installation |
| `kh:install-cursor-hooks` / `uninstall-cursor-hooks` / `cursor-hooks-status` | renderer → main | Same for Cursor |
| `kh:install-codex-hooks` / `uninstall-codex-hooks` / `codex-hooks-status` | renderer → main | Same for Codex |
| `kh:play-fixture` | renderer → main | Replay a recorded scenario for testing |
| `kh:resolve-permission` | renderer → main | Allow/deny a pending permission request |
| `kh:open-path` | renderer → main | Open a file (always tries `cursor://file/...` first) |
| `kh:list-workspace-repos` / `kh:get-settings` / `kh:save-settings` / `kh:validate-workspace-root` | renderer → main | Workspace + settings |
| `kh:load-persisted` / `kh:save-persisted` / `kh:reset-persisted` | renderer → main | Renderer state persistence |

## `safeHandle` — sender-frame guard

```ts
function safeHandle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    const expected = mainWindow?.webContents;
    if (event.sender !== expected || event.senderFrame !== expected.mainFrame) {
      throw new Error(`[keykeeper] ipc rejected: untrusted sender for ${channel}`);
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
4. Expose it on `window.kh` in the preload (`src/preload/index.ts`)
