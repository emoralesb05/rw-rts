# keykeeper

A Kingdom-Hearts-themed _agent watch room_ — a Sims-style spectator
strategy app where the player is the King and their keyblade wielders
(Claude / Cursor / Codex sessions) are out clearing worlds (repos).

You don't command tick-by-tick. You **dispatch**, **send word**,
**comfort**, **recall**, and **seal the keyhole** when each world's
story is done.

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
  open a chat-drawer tab for that wielder and scroll to the event;
  permission rows force-expand AlertsHUD and pulse the matching alert.
- **ChatDrawer** (right edge, on demand) — singleton tabbed drawer for
  per-wielder conversation. Browser-style tabs (per-tab close, status
  dots for unread / permission), drag-to-resize left edge, minimize-
  to-pill. Tab body = ConversationStream filtered to that wielder +
  per-wielder chat input.
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
  toggle. Stored in `~/.keykeeper/state.json`
  and `~/.keykeeper/config.json` (workspace settings).

---

## Run

Requires Bun, macOS (other platforms work but untested).

```sh
bun install
bun run dev          # electron-vite dev with hot reload
bun run typecheck
```

The dev launch will offer to install Claude Code hooks the first time —
this lets keykeeper watch any other Claude session running on your
machine. You can install or skip; toggle any time from the Kingdom
panel's **Connection** tab.

---

## Build a distributable

```sh
bun run pack         # → dist/mac-arm64/Keykeeper.app (unpacked, fast)
bun run dist         # → dist/mac-arm64/Keykeeper.app + dist/Keykeeper-<version>-arm64.dmg
```

Outputs are unsigned. First launch will warn "Apple cannot check it for
malicious software" — bypass with **right-click → Open**, or run
`xattr -cr dist/mac-arm64/Keykeeper.app` once to clear the quarantine
flag.

For real distribution (code signing, notarization, x64), see
[`.docs/architecture/build.md`](./.docs/architecture/build.md). To
swap the icon, drop a 1024×1024 PNG at `build/icon.png` and rebuild.

---

## Settings — `~/.keykeeper/config.json`

Auto-created on first launch. Re-read on every workspace scan, so edits
take effect on the next dropdown render.

```json
{
  "workspaceRoot": "/Users/you/Github",
  "exclude": [
    "vercel-ai", // basename match
    "forks/foo", // parent/repo (matches dropdown label)
    "forks/*", // any repo under any "forks" dir
    "~/Github/teradata/*", // absolute prefix glob
    "/abs/path/to/repo" // exact absolute path
  ]
}
```

Hand-editable, or use the Kingdom panel's **Settings** tab (live
workspace-root validation + exclude textarea).

---

## Multi-tool support

Three agent providers are wired. All three observe via the same Unix
socket bridge (`~/.keykeeper/keykeeper.sock`); a small Python script
(`bin/keykeeper-hook`) is installed into each tool's hook config and
forwards events into the bridge.

| Tool                              | Active spawn                       | Passive watch                                             | Permission control                                                                                                            |
| --------------------------------- | ---------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Claude Code (`claude`)            | ✅ `claude -p` with `--session-id` | ✅ hooks in `~/.claude/settings.json`                     | ✅ keykeeper-authoritative; native terminal prompt races concurrently                                                         |
| Cursor (`cursor-agent` / IDE)     | ✅ `cursor-agent create-chat`      | ✅ hooks in `~/.cursor/hooks.json`                        | ⚠ observational only — Cursor's allowlist mode requires user confirmation in its inline UI; keykeeper letter is informational |
| Codex (`codex` CLI / desktop app) | ✅ `codex exec --json`             | ✅ hooks in `~/.codex/config.toml` (managed marker block) | ✅ keykeeper-authoritative; Codex never shows native UI when the hook decides                                                 |

Hook installs are managed from the Kingdom panel → **Connection** tab:
one toggle per tool. Each one reads/writes only its own config and
preserves any existing entries (e.g. peon-ping for Claude/Cursor).

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

- concept-art extraction (see `.docs/sprite-prompts.md` and the extract
  scripts in `scripts/`).

---

## Architecture in a paragraph

Electron main (`src/main/`) hosts agent adapters that turn real CLI
output and hook events into a uniform `AgentEvent` bus. The Unix-socket
hook bridge (`adapters/hook-bridge.ts`) is the canonical observation
channel for all three tools — Claude/Cursor/Codex install their own
hook configs that pipe payloads into the same socket via
`bin/keykeeper-hook`. Spawned sessions also stream stdout JSON, with
per-tool spawn-id registration so the bridge suppresses duplicate hook
events for the same conversation. Each event is stamped with its
`repoRoot` (nearest `.git/` ancestor) before crossing to the renderer. The renderer's Zustand store
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
under `keykeeper:hud:*`.

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

**No events flowing for a tool.** Open Kingdom panel → **Connection**
tab. Each tool has its own hook bridge toggle; click `Install hooks` for
the relevant tool. Entries land in `~/.claude/settings.json` (Claude),
`~/.cursor/hooks.json` (Cursor), or a managed marker block in
`~/.codex/config.toml` (Codex). All three forward to the same local
Unix socket (`~/.keykeeper/keykeeper.sock`). Uninstall reverts cleanly.

**Hooks installed but a tool's events still don't appear.** Tools read
their hook config at session start. Quit the tool fully (Cmd+Q for the
desktop app, Ctrl+C for a CLI session) and start a fresh session.
Cursor especially needs a full IDE restart, not just a chat reload.

**Lost local state / want to start over.** Kingdom panel → Overview tab →
`Reset kingdom` (danger zone). Or delete
`~/.keykeeper/state.json` directly. Active
sessions stay running.

**Stale settings or excludes.** Edit `~/.keykeeper/config.json` directly; the
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

**Permission flow:** Claude and Codex use the bidirectional
`PermissionRequest` hook (allow/deny in keykeeper is authoritative,
deny-with-reason, indefinite-wait, heuristic auto-dismiss when resolved
upstream, force-expand AlertsHUD on activity-row click). Cursor's
`approvalMode: "allowlist"` makes hook-allow advisory only — keykeeper
still pops a letter for visibility but the King decides in Cursor's
inline yes/no. See `.docs/vision.md` for the protocol-level
constraints behind that asymmetry.

**HUD redesign (shipped):** four-corner glass-pane HUD widgets,
floating panel system (drag, stack, no backdrop), per-wielder Messages
tab with chat input, Dispatch dialog, Kingdom tabbed panel, KingdomHeader
pill as the only top chrome.

**Post-MVP (deferred, not blocking ship):** Cura/Curaga heal-many verbs,
replay mode (event-log scrubber), outbound MCP server, Quest system.

**Known gaps (see `.docs/vision.md` for details):**

- Renderer hardening — `sandbox: true` (preload refactor) and per-handler
  IPC payload schemas. Navigation block + sender-frame guard already
  shipped; the rest matters before public distribution.
- Renderer bundle size (~10 MB) — Streamdown markdown stack loads
  Mermaid/math/Shiki eagerly. Lazy-load is the plan.
- Send-word/recall on hook-observed sessions — currently only works for
  sessions keykeeper spawned itself. Hook-observed wielders show up but
  can't be controlled until AgentManager learns to register them.

See `.docs/vision.md` for the design rationale and the full
question/decision history (Q1–Q44).
