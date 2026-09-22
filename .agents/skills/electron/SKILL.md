---
name: electron
description: Build, review, or debug Electron applications with secure main/preload/renderer boundaries, typed IPC, lifecycle cleanup, BrowserWindow behavior, and packaging. Use for Electron runtime, IPC, desktop security, or packaging work.
license: Complete terms in LICENSE.txt
---

# Electron

Keep privileged work in the main process and expose the smallest possible API
through preload. In an existing repository, read its architecture and security
documents before introducing a new process boundary or IPC channel.

## Core boundaries

- Main owns Node.js APIs, processes, filesystem access, native dialogs, polling,
  and application lifecycle.
- Preload exposes narrow functions with `contextBridge`; never expose
  `ipcRenderer`, generic channel names, or arbitrary command execution.
- Renderer remains an unprivileged web UI. Keep `contextIsolation: true`,
  `nodeIntegration: false`, and sandboxing enabled unless the project documents
  a reviewed exception.
- Treat IPC, deep links, navigation, provider output, filesystem content, and
  child-process output as untrusted. Validate request and response payloads.

## Workflow

1. Identify which process owns the behavior and keep side effects there.
2. Reuse an existing typed IPC/action path when it already expresses the
   capability.
3. For a new IPC path, define a narrow request and response, validate both in
   main/preload, and verify the sender frame using the repository's handler
   wrapper.
4. Invoke executables with argument arrays (`execFile`/`spawn`), not a shell.
   Bound time, output size, concurrency, and cancellation.
5. Register long-lived workers with app startup and stop them idempotently on
   every quit path. Prevent overlapping polls.
6. Test pure normalization/reconciliation separately, then exercise the real
   Electron boundary and packaged form when the change affects runtime or
   distribution behavior.

## Security review

- Block or explicitly route external navigation and new-window requests.
- Never interpolate renderer data into shell commands or executable paths.
- Resolve opaque renderer identifiers to trusted main-process records before a
  privileged action.
- Return structured errors without leaking secrets, raw terminal content, or
  credentials.
- Keep preload listeners removable and validate all main-to-renderer events.
- Verify production Content Security Policy and Electron security warnings for
  release builds.

## Resource routing

Electron 44 changed the native `clipboard` module to asynchronous W3C-style
read/write methods and added `ClipboardItem`. Await those APIs and verify their
current signatures; renderer code should continue to prefer
`navigator.clipboard` when the existing security policy permits it.

- Main lifecycle: [main process](examples/processes/main-process.md)
- IPC patterns: [IPC communication](examples/processes/ipc-communication.md)
- Window setup: [BrowserWindow example](examples/api/browser-window.md) and
  [API notes](api/browser-window.md)
- Packaging: [packaging](examples/advanced/packaging.md)
- Starting files: [main template](templates/main-process.md) and
  [preload template](templates/preload-script.md)

Prefer the current [official Electron documentation](https://www.electronjs.org/docs/latest/)
for version-specific APIs. The bundled references provide patterns, not a
substitute for the installed Electron version's API contract.
