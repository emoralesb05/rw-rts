# State

Three flavors of state live in different places, with different durability guarantees.

## Live state — renderer (Zustand)

`src/renderer/src/store.ts` is the single source of truth for what the UI shows.

| Slice | What it holds |
|---|---|
| `events: AgentEvent[]` | Append-only event log. Newest first. Capped at a soft limit. |
| `units: Record<sessionId, UnitState>` | Derived map of wielders, computed from events |
| `letters` | Pending permission letters and other player-facing messages |
| `panels` | Floating panel positions / open / focused (delegated to `panel-store.ts`) |
| `muted` | Per-session mute state |
| `standingOrders` | Active recurring prompts (see below) |

Updates happen through reducer actions on receipt of `IPC.EventStream` messages.

### `UnitState` shape

```ts
type UnitState = {
  id: string;
  sessionId: string;
  tool: "claude" | "cursor" | "codex" | "gemini";
  role: "warden1" | "warden2" | "warden3" | "warden4";   // archetype, auras sprite + color
  displayName: string;             // "Vaelen", "Selene", etc. — stable per (tool, repoRoot)
  cwd: string;
  repoRoot?: string;               // see "identity stability" below
  worldId: string;
  hp: number;
  mp: number;
  status: "idle" | "working" | "casting" | "moving" | "complete" | "fallen";
  lastActivity: number;
  spawnedAt?: number;              // first-event timestamp; party-list sort key
  lastTool?: string;
  spawnedHere: boolean;            // see "spawn provenance" below
  parentSessionId?: string;        // for sub-agents
  auraState?: "guard" | "focus" | "link";
  auraUntil?: number;
};
```

Wielder identity is `${tool}::${repoRoot}` — used by standing orders, persistent stats, and any cross-session lookup.

## Persisted state — main (autosaved file)

`src/main/persistent-state.ts` writes a debounced snapshot to:

```
~/.realmkeeper/state.json
```

```ts
type PersistedState = {
  schemaVersion: 2;
  kingdomFoundedAt: number;
  totalGlimmerEver: number;
  wielders: Record<string, WielderStats>;   // keyed by `${tool}::${repoRoot}`
  worlds: Record<string, WorldStats>;       // keyed by repoRoot
  standingOrders: PersistedStandingOrder[];
};
```

It captures **enough to rehydrate the renderer on next launch** — wielders the user expects to still see, persistent per-wielder/per-world stats (visits, seals, falls, totalGlimmer), and active standing orders. NOT the entire event history (that's in the JSONLs and SQLite stores anyway).

`schemaVersion` lets the loader migrate older snapshots forward (or fall back to `EMPTY_PERSISTED` if the file is corrupt).

IPC channels: `rw:load-persisted` / `rw:save-persisted` / `rw:reset-persisted`.

## Pending permissions — main (in-memory only)

`hook-bridge.ts` keeps a `Pending` map keyed by `requestId`:

```ts
{ socket, sessionId, cwd, tool }
```

**Not persisted.** A realmkeeper crash means orphaned requests, but the upstream provider will time out the hook on its own (for example, Claude defaults around 30s; Codex and Gemini use longer blocking permission timeouts), so the user's CLI session recovers without manual cleanup.

## Spawn provenance — `unit.spawnedHere`

A wielder's `UnitState` carries `spawnedHere: boolean` — true if Realmkeeper started this session via `AgentManager.spawn`, false if we observed it via hooks. Verbs like *recall* and *send* are gated on this for now. (For the planned "drive observed sessions via `--resume`" work see [`../vision.md`](../vision.md) and [`../plans/observed-resume.md`](../plans/observed-resume.md).)

## Identity stability — `unit.repoRoot`

We persist `unit.repoRoot` (not just `cwd`) so that "standing orders" (auto-rebind by repo root) survive across sub-cwd jumps within the same repo. Without this, a wielder spawned in `~/repo` and one observed at `~/repo/subdir` would look like different units.

`resolveRepoRoot()` lives in `src/main/repo-root.ts` — see [`workspace.md`](./workspace.md) for the resolution strategy.

## Standing orders

`src/renderer/src/standing-orders.ts` + reducer in `store.ts`. A standing order is a recurring auto-prompt:

```ts
type StandingOrder = {
  id: string;
  unitId: string;                  // current session id; "" while waiting to rebind
  unitIdentity: string;            // `${tool}::${repoRoot}`, not unitId
  prompt: string;
  intervalMs: number;
  maxIterations: number;           // default 24
  iterationsRun: number;
  failuresInRow: number;
  status: "active" | "halted" | "exhausted" | "failed";
  startedAt: number;
  lastFiredAt: number;
};
```

- Persisted in `PersistedState` via `ordersToPersisted()` (drops volatile fields)
- On app restart, rebinds to whichever wielder matches `unitIdentity` (repoRoot + tool) — that's why we persist `unit.repoRoot`
- Stops after `maxIterations` to prevent runaway loops
- A user can halt early with the `recall`/`seal` actions on the wielder

## Agent manager

`src/main/agent-manager.ts` is the unified spawn/list/kill surface across all provider tools. A single `AgentManager` object hides the per-tool adapter (`spawnClaudeAgent`, `spawnCursorAgent`, `spawnCodexAgent`, `spawnGeminiAgent`).

```ts
AgentManager.spawn(tool, { prompt, cwd })  // dispatches by tool
AgentManager.send(unitId, prompt)          // looks up across all provider registries
AgentManager.kill(unitId)
AgentManager.killAll()                     // called in will-quit
```

The `AnyAgent` interface (`{unitId, sessionId, cwd, send, kill}`) is the common contract every adapter implements. New providers add a `*-cli.ts` adapter exposing the same shape.

## Domain models (in-app fiction)

Defined in `src/shared/events.ts`. These are RW-themed but they ARE the data model — not just decoration:

- **`UnitRole`** = one of four warden archetypes: `warden1` (Vaelen, dusk-purple), `warden2` (Selene, dream-petal pink), `warden3` (Ryder, forge orange), `warden4` (Lyris, tide cyan). Assigned **deterministically** from `(tool, repoRoot)` — the same wielder identity always gets the same archetype + display name, across sessions and restarts.
- **`WardenAura`** = `guard | focus | link` — an elevated state a wielder can enter (e.g. on a streak of successful turns). `auraUntil` is the expiration timestamp. Cosmetic for now (color shift), no gameplay impact.
- **`Riftling`** = `shadow | soldier | bulwark` — enemy sprites in the Phaser scene that visualize stuck/erroring wielders. Spawned by the renderer in response to `error` events; cleared on recovery.
- **`WielderStats`** (persisted, keyed by `${tool}::${repoRoot}`) — `visits`, `seals`, `falls`, `totalGlimmer`, `lastSeen`. Sims-style memory across sessions.
- **`WorldStats`** (persisted, keyed by `repoRoot`) — `lastVisit`, `totalSeals`, `totalClears`, `totalFalls`, `sealedAt?`. Per-repo counters.

## Schema migration

`PersistedState.schemaVersion` is the on-disk version marker (currently `2`). `src/main/persistent-state.ts` handles version drift:

- **Match** (`schemaVersion === EMPTY_PERSISTED.schemaVersion`) → load as-is
- **Known older version** (e.g. `schemaVersion === 1`) → migrate forward in code (explicit transformation block per upgrade)
- **Unknown / corrupt / unparseable** → reset to `EMPTY_PERSISTED` with a fresh `kingdomFoundedAt`

Migrations are **forward-only**. When you bump the version, write the upgrade for the immediately previous version (`N-1 → N`) — not a chain. Old enough snapshots just get wiped, which is fine because the actual conversation data lives in provider JSONLs/SQLite, not here.
