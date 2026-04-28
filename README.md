# keykeeper

A Kingdom-Hearts-themed *agent watch room* — a Sims-style spectator
strategy app where the player is the King at Disney Castle and their
keyblade wielders (Claude / Cursor / Codex sessions) are out clearing
worlds (repos).

You don't command tick-by-tick. You **dispatch**, **send word**,
**comfort**, **recall**, and **seal the keyhole** when each world's
story is done.

> Currently a personal tool. Built honestly enough to share, not polished
> enough to onboard strangers. Repo dir on disk is still `kh-rts/` — the
> package is `keykeeper`. See `.docs/plans/vision.md` for the full design.

---

## What you get

- **Throne Room** — the home view. Wielder cards (HP / MP / Focus / mood
  / current world), letter feed (severity-colored), kingdom stats.
- **Gummi Map** — themed planets per repo (Disney Castle, Hollow Bastion,
  Traverse Town, Destiny Islands, Twilight Town, Halloween Town).
- **World Arena** — an isometric scene where you dive into a single
  world. Pixel-art wielders patrol around landmarks. Heartless spawn
  from errors. Drive forms (Valor / Wisdom / Final) trigger on streaks.
  Time-of-day cycle reflects session age.
- **Persistence** — sealed keyholes, lifetime munny, kingdom founded
  date, per-wielder + per-world stats. Stored in
  `~/Library/Application Support/keykeeper/state.json`.

---

## Run

Requires Bun, macOS (other platforms work but untested).

```sh
bun install
bun run dev      # electron-vite dev with hot reload
bun run build    # bundle for distribution
bun run typecheck
```

The dev launch will offer to install Claude Code hooks the first time —
this lets keykeeper watch any other Claude session running on your
machine. You can install or skip; uninstall any time from the topbar.

---

## Multi-tool support

Three agent providers are wired:

| Tool | Active spawn | Passive watch |
|---|---|---|
| Claude Code (`claude`) | ✅ via `claude -p` with `--session-id` | ✅ via socket-bridge hook bridge |
| Cursor (`cursor-agent`) | ✅ via `cursor-agent create-chat` | ✅ via SQLite tail of `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
| Codex (`codex`) | ✅ via `codex exec --json` | ✅ via JSONL tail of `~/.codex/sessions/...` |

Each session gets a wielder identity = `(tool, repoRoot)` — same tool +
same repo always means the same wielder, with persistent visit/seal/fall
counts.

---

## Drop-in art and sounds

```
assets/sprites/kh/<role>.png            # 32×32 still — your override
assets/sprites/kh/<role>_sheet.png      # 256×32 sheet, 8 frames horizontal
assets/sprites/kh-default/...           # shipped pixel-art defaults
assets/sounds/kh/<name>.{wav,mp3,ogg}   # SFX overrides
```

The runtime priority is: `kh/` override → `kh-default/` shipped →
synthesized fallback.

Generate fresh defaults with `bun scripts/generate-pixel-sprites.ts`.

---

## Architecture in a paragraph

Electron main (`src/main/`) hosts agent adapters that turn real CLI
output / SQLite tails / JSONL streams into a uniform `AgentEvent` bus.
Each event is stamped with its `repoRoot` (nearest `.git/` ancestor)
before crossing to the renderer. The renderer's Zustand store
(`src/renderer/src/store.ts`) is the simulation state — units, worlds,
heartless, drives, letters, alert levels — all derived from events. A
single Phaser game runs three scenes (Throne / Gummi / World) with
shared filter pipelines (CRT scanline + bloom + vignette + per-scene
color grade). React panels overlay the canvas for the info-dense parts
(throne cards, chat, unit dock).

Persistent state lives in JSON in the userData dir; main reads it on
launch and writes it debounced as the renderer dispatches updates.

---

## Demo / fixtures (no API tokens)

The `▶ demo` dropdown in the topbar fires scripted event sequences for
visual + chat + combat iteration:

- `claude-starter` — single Claude turn
- `cursor-turn` — multi-tool Cursor turn
- `codex-shell` — Codex shell command
- `subagent` — Claude with subagent (Mickey promotion + tether)
- `combat` — heartless raid with errors and recoveries
- `stress` — 30-event burst
- `demo` — all three tools in parallel

Use these freely; they don't burn API tokens.

---

## Troubleshooting

**"hooks: off" in the topbar.** The Claude hook bridge isn't installed.
Click the "hooks: off" button to install — adds entries to
`~/.claude/settings.json` that forward tool-call events to a local
socket. Uninstall reverts cleanly.

**Cursor monitor disabled.** No `state.vscdb` found — happens if Cursor
hasn't been opened yet on this machine. Open Cursor once and restart
keykeeper.

**Lost local state / want to start over.** Delete
`~/Library/Application Support/keykeeper/state.json` (or use the reset
verb when wired in a future polish iteration). Kingdom founded
timestamp resets to "now" on next launch.

**Sprites look fuzzy.** Phaser scaling fell back to bilinear. Confirm
`pixelArt: true` in `src/renderer/src/game/PhaserGame.tsx`.

---

## Status

The MVP per `.docs/plans/vision.md` is shipped:

- ✅ P1 rename to keykeeper
- ✅ P2 Phaser 4 filter pipeline validated
- ✅ P3 Atmosphere pass on Gummi Map
- ✅ P4 Pixel art sprite generator
- ✅ P5 Atmosphere pass on World Arena
- ✅ P6 Throne Room (hybrid React + Phaser layout)
- ✅ P7 Persistent state JSON
- ✅ P8 Decision-moment letters + verbs (Comfort + Seal flow)
- ✅ P9 Seal fanfare on Gummi Map
- ✅ P10 README

Polish items deferred (see vision doc): Tier 2/3 shaders (water, fire,
magic energy, displacement, chromatic aberration), chiptune music,
per-world signature decorations beyond the MVP one-each, composite-form
banners, real-token MP per adapter, Renown star-rank UI, Cura/Curaga
tier verbs, replay mode, outbound MCP server.
