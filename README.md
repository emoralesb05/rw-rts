# keykeeper

A Kingdom-Hearts-themed *agent watch room* — a Sims-style spectator
strategy app where the player is the King and their keyblade wielders
(Claude / Cursor / Codex sessions) are out clearing worlds (repos).

You don't command tick-by-tick. You **dispatch**, **send word**,
**comfort**, **recall**, and **seal the keyhole** when each world's
story is done.

> Currently a personal tool. Built honestly enough to share, not polished
> enough to onboard strangers. Repo dir on disk is still `kh-rts/` — the
> package is `keykeeper`. See `.docs/plans/vision.md` for the full design.

---

## What you get

A FFXIV-style HUD overlay on a single full-viewport kingdom canvas:

- **KingdomHeader pill** (top-center) — `⌬ Keykeeper · ✦ N sealed · ⚔ N
  wielders · µ N · founded Nd ago · 🔊 ⚙`. Mute toggle on the left, ⚙
  opens the **Kingdom panel** (Overview · Settings · Connection · Demos).
- **WielderHUD** (top-left) — party list with role-colored portrait, name,
  tool pill, behavior-class chip (Tank/Healer/DPS/Roamer), HP/MP bars
  (FF14 stacked nameplate style), live cast bar when mid-tool, status
  icons (drive form / casting / standing-order / HP-critical), 💬 chat
  shortcut, and a `+ DISPATCH` button that opens the Dispatch dialog.
- **AlertsHUD** (top-right, orange-toned) — permission requests as
  inline action cards (allow / deny / deny-with-reason).
- **LettersHUD** (bottom-right) — informational letters: one per
  wielder, most-recent wins. Click a letter to pan the camera to that
  world.
- **ActivityLog** (bottom-left) — one-line summaries of recent events
  across the kingdom, tone-coded. Click a row to jump: textual events
  open the wielder's Messages tab and scroll to that event; permission
  rows force-expand AlertsHUD and pulse the matching alert.
- **Kingdom canvas** — pan/zoom Star Chart. Each repo is a world
  (Disney Castle / Hollow Bastion / Traverse Town / Destiny Islands /
  Twilight Town / Halloween Town). Wielders render inside their world's
  iso plane as painterly pixel sprites with FF14 nameplate-style HP/MP
  bars and KH-flavored speech bubbles on big events.
- **Floating panels** — wielder details, Kingdom, Settings, Dispatch,
  Decree composer. All draggable, stack via z-index, no backdrop, close
  individually or with `⌘⇧W` / the `✕ close N` chip.
- **Persistence** — sealed keyholes, lifetime munny, kingdom founded
  date, per-wielder Renown (visit/seal/fall), HUD collapse + ghosted
  toggle. Stored in `~/Library/Application Support/keykeeper/state.json`
  and `~/.keykeeper.json` (workspace settings).

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
machine. You can install or skip; toggle any time from the Kingdom
panel's **Connection** tab.

---

## Settings — `~/.keykeeper.json`

Auto-created on first launch. Re-read on every workspace scan, so edits
take effect on the next dropdown render.

```json
{
  "workspaceRoot": "/Users/you/Github",
  "exclude": [
    "vercel-ai",                 // basename match
    "forks/foo",                 // parent/repo (matches dropdown label)
    "forks/*",                   // any repo under any "forks" dir
    "~/Github/teradata/*",       // absolute prefix glob
    "/abs/path/to/repo"          // exact absolute path
  ]
}
```

Hand-editable, or use the Kingdom panel's **Settings** tab (live
workspace-root validation + exclude textarea).

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

Generate fresh defaults with `bun scripts/generate-pixel-sprites.ts
landmarks` (or `heartless` / `tiles` / `all`). The script supports a
group filter so it doesn't clobber hand-authored keybladers by default.
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
single Phaser scene (`KingdomScene`) renders the unified Star Chart
with a shared filter pipeline (CRT scanline + bloom + vignette + per-
event Tier 3 shader pulses + per-theme atmospherics). React HUD
widgets and floating panels overlay the canvas — no top toolbar; the
KingdomHeader pill is the de-facto chrome.

Persistent state lives in JSON in the userData dir; main reads it on
launch and writes it debounced as the renderer dispatches updates.
HUD UI prefs (collapsed widgets, "show ghosted") live in localStorage
under `kh-rts:hud:*`.

---

## Demos / fixtures (no API tokens)

Open the **Kingdom panel** (⚙ on the pill) → **Demos** tab. Two groups:

- **Summon** — drop a single archetype (Vaelen / Selene / Ryder / Lyris)
  into a fresh `/tmp` world. Useful for iterating on visuals.
- **Flows** — `cursor-turn`, `codex-shell`, `subagent` (Claude with
  subagent + Final drive), `combat` (heartless raid), `stress` (30
  events), `permission` (approval letter), `demo` (all 3 tools).

Use freely; they emit synthetic events, no API tokens spent.

---

## Troubleshooting

**Hooks off / no Claude events flowing.** Open Kingdom panel → **Connection**
tab. Click `Install hooks`. Adds entries to `~/.claude/settings.json` that
forward tool-call events to a local Unix socket
(`~/.claude/kh-rts.sock`). Uninstall reverts cleanly.

**Cursor monitor disabled.** No `state.vscdb` found — happens if Cursor
hasn't been opened yet on this machine. Open Cursor once and restart
keykeeper.

**Lost local state / want to start over.** Kingdom panel → Overview tab →
`Reset kingdom` (danger zone). Or delete
`~/Library/Application Support/keykeeper/state.json` directly. Active
sessions stay running.

**Stale settings or excludes.** Edit `~/.keykeeper.json` directly; the
spawn dropdown re-reads on each open. The Settings tab's live workspace-
root validation also surfaces typos.

**Sprites look fuzzy.** Phaser scaling fell back to bilinear. Confirm
`pixelArt: true` in `src/renderer/src/game/PhaserGame.tsx`.

---

## Status

**MVP shipped 2026-04-29.** Phase 2B north star (attention-direction +
in-context observability) is functionally complete. Most of the locked
Phase 2A subset shipped: Tier 2 + Tier 3 shaders, chiptune music, per-
world signature decorations, composite-form banners, real-token MP
weighting, Renown star-rank UI.

**Wielder polish (shipped):** patrol, event-driven animation switching,
drive auras, subagent tether, HP/MP bars (FF14 nameplate style with
multi-modal critical-HP feedback), death/victory poses, KH-flavored
voice barks (per-archetype), Tank/Healer/DPS behavior class chip,
live cast bars on party rows.

**Permission flow:** PermissionRequest hook with deny-with-reason,
indefinite-wait (no client-side timeout), heuristic auto-dismiss when
resolved upstream, force-expand AlertsHUD on activity-row click.

**HUD redesign (shipped):** four-corner glass-pane HUD widgets,
floating panel system (drag, stack, no backdrop), per-wielder Messages
tab with chat input, Dispatch dialog, Kingdom tabbed panel, KingdomHeader
pill as the only top chrome.

**Post-MVP (deferred, not blocking ship):** Cura/Curaga heal-many verbs,
replay mode (event-log scrubber), outbound MCP server, Quest system.

See `.docs/plans/vision.md` for the design rationale and the full
question/decision history (Q1–Q44).
