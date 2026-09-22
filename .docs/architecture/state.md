# State

Four flavors of state live in different places, with different durability guarantees.

## Reconciled monitor state — main (in-memory)

`src/main/monitoring/` owns the operational fleet view. Provider inventory,
normalized events, and optional Herdr metadata become validated observations;
the reconciler selects an explainable state while retaining all source
evidence. Main publishes a typed snapshot plus versioned deltas through
preload. The renderer may filter and select rows, but it does not infer source
authority or freshness.

The renderer's `monitoring/monitor-store.ts` is a shared read replica, connected
once by `App` across Monitor/Realm switches. It buffers deltas until initial
hydration, ignores old versions, and requests a full snapshot on version gaps.
Failed synchronization exposes unavailable data instead of a partial fleet.
Cleanup prevents an obsolete connection's response from replacing a new one.

Realm session activity captions, inspector cards, ask navigation, work effects,
and party activity use this same snapshot. Matching requires provider plus
native session ID, never repository or session ID alone. Unknown/offline labels
come from main; there is no separate two-minute Realm freshness timer. Historical
HP/MP, world pressure, seals, and event-driven cinematic poses remain game state,
not operational evidence or proof of task success.

Live reconciliation remains ephemeral. A separate main-owned
`monitor-history.ts` checkpoint at `~/.realmkeeper/monitor/last-seen.json`
remembers only agent identity, provider, last observed state, and observation
timestamp. Monitor shows these in a read-only **Last seen history** section;
they never hydrate live agents, controls, or permissions. Fresh source evidence
is required to reappear in the live fleet.

This bounded first slice retains at most 200 latest-per-session records for
30 days and 20 restart-gap markers. It is not a complete event journal. Atomic
replacement runs every 15 seconds and on normal shutdown; a crash can lose the
uncheckpointed tail. Restart marks the interval from the last checkpoint to
startup as unverified, not as inactivity. No backfill is performed. Files over
512 KiB, invalid JSON, or unsupported schemas are quarantined before replacement;
if quarantine fails, persistence stays disabled and the original is untouched.
Read/write failures are visible in history, without disabling live monitoring.

Observation journaling, configurable retention, and usage rollups remain future work. Prompt bodies, tool input/output,
free-text activity/reasons, transcript content, and terminal scrollback are not
included in monitoring checkpoints. Characters and Realm game state are unchanged.

## Attention notification preferences — main

`monitor-attention.ts` projects local acknowledgement and 15-minute snooze
preferences onto the current attention list. It does not change agent state,
answer permissions/input, or invoke provider controls. Acknowledged alerts remain
visible as unresolved; snoozed alerts move to a separate expandable section.
Reopen removes the local preference. Main's freshness tick publishes snooze expiry.

`~/.realmkeeper/monitor/attention.json` atomically saves choices immediately,
using hashed occurrence keys, lifecycle, and timestamps only (no request content,
raw request IDs, titles, or summaries). Preferences are bounded to 1,000 entries
and 30 days. Save failure rejects the action without optimistic UI dismissal.
Unreadable/oversized/unsupported-schema files are quarantined; failure to quarantine
disables writes. Integration health exposes persistence warnings.

Event-backed request identity includes provider, native session, request kind,
and request ID. A new request gets a new occurrence even in the same session;
stale UI actions fail closed. A late resolution cannot clear a different current
request. Resolved/replaced occurrences lose their preferences. Restoring choices
does not restore alerts: fresh matching evidence is required. Conditions without
source-backed occurrence identity keep one occurrence during continuous observation,
but reopen after restart or observed recovery because continuity across a gap is
unproven. This is notification preference persistence, not a full attention audit log.

## Live state — renderer (Zustand)

Monitor's selected-agent conversation drawer reuses `ConversationStream`,
`LetterCard`, and existing session-control IPC. Conversation selection requires
provider plus native session identity (or an explicit local alias); matching by
repository or bare session ID across providers is prohibited. This reads captured
renderer events only, not a full transcript or durable conversation journal.
Permission/input cards use the existing request actions, including scoped saved
rules; opening the drawer never changes approval policy.

Messaging distinguishes steering an owned active turn, sending a follow-up, and
resuming an observed session. Unknown/offline or blocked sessions cannot receive
new messages from Monitor; observed working sessions must be handled natively or
wait before resume. Failed sends retain the draft and expose the error. Success
means IPC acceptance, not a confirmed provider response. Native inventory state
must retain the event source's local process ID for owned-session routing.
Model is shown when reported; effective approval policy remains unknown. Model
switching and a generic auto-approve toggle are not implemented by this UI slice.

Ended sessions now expose a separate `resume` action, not a re-enabled
ordinary send. Main resolves the current provider/native session, local routing ID,
working directory, terminal state, and capability before dispatch. History-only,
changed, working, blocked, failed, and unknown/offline records cannot authorize resume.
An error alone does not prove that a provider process or turn has ended.
Existing provider resume/send adapters are reused; provider settings are unchanged.
Resume is rejected if main no longer reports the session as done; renderer status
cannot override that check. Provider resume availability/errors still depend on
the installed CLI.

Conversation drafts, in-flight actions, and acceptance results are keyed by
provider plus native session in an app-lifetime renderer store. They survive
selection, drawer, and workspace changes, but not app restart, and are never
written to monitoring checkpoints or localStorage. Failed sends retain drafts;
an asynchronous result updates its originating agent, not the current selection.
Post-send activity labels use scoped captured events and explicitly do not claim
a correlated delivery receipt. Full message/turn IDs and durable delivery tracking
remain future work.

`src/renderer/src/store.ts` owns game state and historical events. Reconciled
operational activity comes from the shared monitor read replica above.

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
{ socket | resolve, sessionId, cwd, tool, name, input, options }
```

**Not persisted.** A realmkeeper crash means orphaned requests, but the upstream provider will time out the hook on its own (for example, Claude defaults around 30s; Codex and Gemini use longer blocking permission timeouts), so the user's CLI session recovers without manual cleanup.

## Saved permission rules — main (persisted file)

`src/main/permission-rules.ts` stores Realmkeeper-local rules at:

```
~/.realmkeeper/permissions.json
```

Rules match provider, scope, tool name, and the stable argument key derived from
the request input (`cmd:pnpm test`, `file:/repo/src/app.ts`, `glob:*.ts`,
etc.). The hook bridge checks these rules before it emits a permission letter:

- matching actionable Claude / Codex / Gemini requests are answered immediately
- Cursor remains observe-only in normal allowlist mode
- deny rules win over allow rules (`global deny` > `workspace deny` >
  `session deny` > `session allow` > `workspace allow` > `global allow`)
- auto-resolutions emit a `permission_resolved` event with rule metadata so the
  Activity log shows an audit row

The Connection tab lists and removes saved rules. Realmkeeper does not currently
write provider-native persistent config for these rules.

## Spawn provenance — `unit.spawnedHere`

A wielder's `UnitState` carries `spawnedHere: boolean` — true if Realmkeeper
started this session via `AgentManager.spawn`, false if we observed it via
hooks. Direct chat sends can target observed sessions through provider resume
APIs. Higher-impact verbs such as recall, decrees, and standing-order loops stay
scoped to Realmkeeper-spawned sessions because Realmkeeper owns those child
processes.

## Identity stability — `unit.repoRoot`

We persist `unit.repoRoot` (not just `cwd`) so that "standing orders" (auto-rebind by repo root) survive across sub-cwd jumps within the same repo. Without this, a wielder spawned in `~/repo` and one observed at `~/repo/subdir` would look like different units.

`resolveRepoRoot()` lives in `src/main/repo-root.ts` — see [`workspace.md`](./workspace.md) for the resolution strategy.

## Standing orders

Current execution is main-owned through durable runs. The renderer shape below
describes legacy state retained for migration, not the active timer runner.
See the [orchestration plan](../plans/agent-orchestration-workflows/) for shipped
behavior and remaining outcome/monitor-pause contracts.

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
