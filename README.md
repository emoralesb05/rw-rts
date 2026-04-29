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
assets/sprites/kh-default/              # shipped art (gitcommitted)
  keyblader{1-4}.png                    # painterly still, ~290×200
  keyblader{1-4}_sheet.png              # 32-frame sheet (idle×3 facings,
                                        #   walk×3 facings, attack, cast)
  heartless-{shadow,soldier,largebody}{,_sheet}.png   # 32×32, 8-frame sheets
  landmark-{disney,hollow,traverse,destiny,twilight,halloween}.png  # 64×64
  tile-iso-{a,b}.png                    # iso ground tiles

assets/sprites/kh/                      # YOUR overrides (gitignored)
  keyblader{1-4}.png                    # match shipped resolution
  keyblader{1-4}_sheet.png              # match shipped resolution

assets/sounds/kh/<name>.{wav,mp3,ogg}   # SFX overrides
```

The runtime priority is: `kh/` override → `kh-default/` shipped →
synthesized fallback. Override existence is probed on app boot
(content-type checked since Vite dev returns 200/HTML for missing
static files); only existing overrides get registered as Phaser
textures, so missing overrides don't pollute the console.

Generate fresh 32×32-style defaults with
`bun scripts/generate-pixel-sprites.ts` (script targets `kh-default/`).
Painterly hi-res keybladers were authored separately via AI generation
+ concept-art extraction (see `.docs/sprite-prompts.md` and the extract
scripts in `scripts/`).

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

**MVP (P1–P10):** ✅ all shipped.

**Q40 unified Star Chart:** ✅ shipped (single pan/zoom canvas
replaces the 3-scene drill-down; worlds clustered by parent dir;
side overlay panel for cards + letters).

**Phase 2B (8 of 10 items):** ✅ attention-direction layer · ✅ Decree
verb (with Standing Order recurring sub-mode) · ✅ voice input
(transcription) · ✅ desktop OS notifications · ✅ permission approval
(bidirectional Claude Code hook integration; works cleanly for
keykeeper-spawned sessions) · ✅ stuck-loop detection with explanation
· ✅ why-trace (expandable "what led to this" on tool calls).
⏸ Quest system + ⏸ standalone permission-context observability
sub-feature.

**Phase 2A polish (locked, not yet started):** Tier 2/3 shaders
(water, fire, magic energy, heat haze, chromatic aberration),
chiptune music, per-world signature decorations beyond the MVP
one-each, composite-form banners (Pair / Royal Guard / Wayfinder
Trio), real-token MP per adapter, Renown star-rank UI, Cura/Curaga
tier verbs, replay mode, outbound MCP server.

**Wielder polish deferred during the unified-map iso port:** patrol
behavior (wielders currently stand at home tile), event-driven
animation switching (attack on tool_use, cast on certain events),
drive-form auras + activation flash, subagent tether visualization,
HP/MP rings overlaid on wielders, death/victory poses on
session_end / HP=0.

See `.docs/plans/vision.md` for the design rationale and the full
question/decision history (Q1–Q44).
