---
name: realmkeeper-architecture
description: Apply Realmkeeper's repository architecture when changing Electron processes, IPC, provider adapters, monitoring, state, permissions, or the React/Phaser UI. Use for implementation, refactoring, or architecture review in this repository.
---

# Realmkeeper architecture

Read the durable documents relevant to the change before editing:

- [process and security boundaries](../../../.docs/architecture/processes.md)
- [IPC validation](../../../.docs/architecture/ipc.md)
- [events and watchers](../../../.docs/architecture/events.md)
- [state ownership and persistence](../../../.docs/architecture/state.md)
- [product vision](../../../.docs/vision.md)
- for Monitor work, the active
  [control-plane architecture](../../../.docs/plans/agent-observability-control-plane/ARCHITECTURE.md)

Preserve these invariants:

- Main owns process, filesystem, socket, polling, and persistence side effects.
- Renderer is UI-only and receives validated data through the narrow preload
  API and typed IPC.
- New IPC uses `safeHandle`, sender-frame validation, Zod request/response
  schemas, and validated main-to-renderer payloads.
- Provider-native session identity wins; repository path is context, not agent
  identity.
- Missing or stale evidence becomes unknown/offline, never fabricated idle or
  success.
- Controls reuse provider capability checks and fail closed when unsupported.
- Monitoring stores metadata and bounded summaries by default, not prompts,
  tool arguments/results, transcript bodies, or terminal scrollback.
- Polling is asynchronous, non-overlapping, bounded, and stopped on every app
  cleanup path.
- React owns operational UI and overlays; Phaser owns the Realm canvas. They
  share state contracts rather than controlling each other's internals.

Keep modules aligned to one concern. Extract source normalization,
reconciliation, runtime orchestration, and UI regions when a file begins to
mix those responsibilities. Verify with typecheck, unit tests, lint, build, and
an Electron runtime check proportional to the change.
