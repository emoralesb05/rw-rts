# Architecture

How Realmkeeper is built. Slow-changing reference for our internal design.

For external-tool quirks and integration notes, see [`.docs/providers/`](../providers/).
For tactical per-feature plans, see [`.docs/plans/`](../plans/).
Vocabulary (RW terms + technical) is centralized in [`.docs/glossary.md`](../glossary.md) — skim that before reading the rest.

## Files

- [`processes.md`](./processes.md) — Electron processes, security boundaries, single-window decision
- [`ipc.md`](./ipc.md) — IPC channels reference + the `safeHandle` sender-frame guard
- [`events.md`](./events.md) — event bus, `AgentEvent` shape, transcript watchers, fixtures, ordering
- [`state.md`](./state.md) — live (Zustand), persisted, pending permissions, spawn provenance, standing orders, agent manager
- [`bridge.md`](./bridge.md) — the unix-socket hook bridge: dispatch, dedup, normalization
- [`renderer.md`](./renderer.md) — Phaser + DOM coexistence, HUD, floating panels, conversation stream, activity log
- [`build.md`](./build.md) — stack (Bun, Electron 41, Vite, React 19, Phaser 4), scripts, hot-reload caveats, debugging
- [`workspace.md`](./workspace.md) — settings file, repo-root resolution, workspace scanning
- [`letters.md`](./letters.md) — the player-facing async message system + decree modal

## Reading order

If you're new: `processes.md` → `events.md` → `bridge.md` → `renderer.md`. Those four give you the spine across both processes. `ipc.md`, `state.md`, `letters.md`, `workspace.md` are reference — pick them up when you need them. `build.md` is the dev-friction primer; read it first if you're setting up.

## What's NOT here

- Per-CLI quirks (Claude/Codex/Cursor/Gemini) → [`../providers/`](../providers/)
- Strategic north star (philosophy, locked decisions, open questions) → [`../vision.md`](../vision.md)
- Tactical per-feature plans → [`../plans/`](../plans/)
- UI concept art → `../concept-art.png`, `../sprite-prompts.md`
