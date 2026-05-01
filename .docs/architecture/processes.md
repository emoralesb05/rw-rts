# Processes & security

Electron app with strict main↔renderer separation. Single window, single user. All side effects (process spawning, file I/O, hook bridge, network) live in the main process; renderer is pure UI talking through typed IPC.

## Process layout

```
Electron main (Node.js)            Renderer (React 19 + Phaser 4)
─────────────────────────          ────────────────────────────────
hook-bridge       (UNIX socket)    Phaser KingdomScene (canvas)
agent-manager     (child procs)    HUD overlay (DOM, on top)
*-hook-installer  (settings.json)  Floating panels (modals)
*-cli adapters    (spawn, stdin)   Zustand store (events, units)
*-transcript      (file polling)   IPC client via preload
event-bus         (in-process)
persistent-state  (autosave)
                              ↑           ↓
                              IPC via preload (contextIsolation: true)
```

## Single-window decision

We chose one window with floating in-renderer panels (instead of multiple OS windows for each wielder) because:

1. Ergonomics — Cmd-Tab between wielder windows breaks the "watch room" metaphor
2. Zustand store is one source of truth; multi-window would need IPC sync per renderer
3. Permission letters and the activity log are global, not per-wielder

## Security boundaries

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (we need preload Node access)
- Preload (`src/preload/`) exposes a typed `window.kh` API; no direct `ipcRenderer`
- `safeHandle()` wraps every IPC handler with a sender-frame check (see [`ipc.md`](./ipc.md))
- `will-navigate` + `setWindowOpenHandler` block external navigation; URLs go to OS browser
- Hook script (`bin/kh-rts-hook`) treats stdin as untrusted JSON, never invokes shell
