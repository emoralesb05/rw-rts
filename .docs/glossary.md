# Glossary

Vocabulary used across realmkeeper. Half is RW-themed (the in-app fiction), half is technical. New contributors: skim this once before reading the rest of the docs.

## In-app vocabulary (RW-themed)

| Term | Means |
|---|---|
| **King** | The user. You are the King at Crown Citadel. |
| **Wielder** | One running CLI session — Claude / Cursor / Codex. The realm wardens out clearing worlds on your behalf. |
| **Tool relic** | A wielder's tool of choice. The CLI itself: claude / cursor-agent / codex. |
| **World** | A repo. Each repo root is its own world; multiple wielders can be active in one world. |
| **Kingdom** | The whole realmkeeper instance — all your worlds and wielders together. |
| **Riftling** | An error / failure / stuck wielder. Visualized as enemy sprites in the Phaser scene. |
| **Glimmer** | Activity points / progress score. Cosmetic, no gameplay impact yet. |
| **Aura state** | A wielder's elevated state during a session — guard / focus / link. Cosmetic for now. |
| **Letter** | A player-facing async message (permission request, alert, prompt). The central UX surface. |
| **Decree** | A critical letter — full-screen blocking dialog that requires a decision. |
| **Throne Room** | The main HUD area where letters and the activity log live. |
| **Standing order** | A recurring auto-prompt the user has set on a wielder ("every 5 min, check tests"). |

## Player verbs (six)

The actions a King can take. Each maps to a `LetterAction` kind.

| Verb | Action kind | Means |
|---|---|---|
| **Dispatch** | `dispatch` / spawn | Send a wielder into a world (start a new session) |
| **Send word** | `send-word` | Pipe a follow-up prompt to a live wielder |
| **Recall** | `recall` | Kill a wielder (SIGTERM the process) |
| **Comfort** | `comfort` | Soothe a stuck/erroring wielder (currently visual feedback only) |
| **Iterate** | `iterate` | Run a standing order one more time, manually |
| **Dive / Seal** | `dive` / `seal` | Focus camera on a world / mark a world's task complete |

## Technical terms

| Term | Means |
|---|---|
| **Hook** | A provider-installed shell-out that fires on lifecycle events (PreToolUse, etc.) and writes to our socket |
| **Bridge** | `src/main/adapters/hook-bridge.ts` — the unix-socket listener that ingests hook payloads and normalizes them |
| **Multiplexer** | `bin/realmkeeper-hook` — the Python script every provider's hook calls; routes to the bridge |
| **Transcript watcher** | A poller (`*-transcript.ts`) that reads a provider's on-disk session JSONL for events that don't fire as hooks (e.g. assistant text from Claude/Codex) |
| **Adapter** | `src/main/adapters/<provider>-cli.ts` — the spawn surface for one provider |
| **AgentEvent** | The normalized event shape emitted by the bridge and consumed by the renderer |
| **AgentManager** | `src/main/agent-manager.ts` — unified spawn/kill/list across CLI adapters |
| **Wielder identity** | `${tool}::${repoRoot}` — the stable key for "same wielder across sessions" (used by standing orders) |
| **Spawned vs observed** | `unit.spawnedHere` — true if Realmkeeper started this session, false if we picked it up via hooks |
| **Sender frame guard** | `safeHandle()` — IPC wrapper that rejects calls from non-mainframe sources |
| **Dedup window** | Bridge-level TTL Map that drops re-fires of the same hook within a short window (1.5s standard, 12s for prompts) |
| **Letter severity** | `critical | important | notable` — drives which surface a letter renders into |
| **Letter risk** | `low | elevated | high` — for permission letters; drives card tinting |
