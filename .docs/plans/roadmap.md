> **STATUS: superseded — see `vision.md`** (2026-04-28)
>
> This roadmap reflects the original RTS framing of the project before the
> rename to **keykeeper** and the pivot to Sims-style spectator strategy.
> Stack details (Phaser 3.90), guiding principles (RTS unit command), and
> many "big rocks" listed below are out of date. Kept as historical
> context for how the project's framing evolved. For current direction,
> status, and open questions, see `vision.md`.

# kh-rts roadmap

A KH-themed RTS visualizer for Claude Code / Cursor / future-tool agents.
Real agent activity drives unit behaviour. Local-first Electron app.

## Status snapshot

| Area | State |
|---|---|
| Stack | Electron 41 · Vite 8 · electron-vite 5 · TS 6 · React 19 · Phaser 3.90 · Tailwind 4 · Streamdown 2 · Zustand 5 (all latest) |
| Build/typecheck | clean |
| Claude active spawn | works (`claude -p ... --session-id <uuid>`) |
| Claude passive monitor | works (hook bridge → python3 socket forwarder) |
| Cursor active spawn | works (`cursor-agent create-chat` → `--resume <id>`) |
| Cursor passive monitor | works (SQLite tail with WAL fix; user_prompt only) |
| Chat panel | Streamdown + 4 plugins; per-event unit badges; 570px wide |
| Sprite/sound pipelines | drop PNGs/audio into `assets/sprites/kh/`, `assets/sounds/kh/`; loaders auto-pick up |
| Phaser visuals | drawn KH-styled silhouettes + KH-themed buildings (Disney Castle, Hollow Bastion, Traverse Town) |
| Git | zero commits, untracked |
| README | not written |

## Guiding principles

Lifted from the "agentic RTS" gamedev advice (mostly endorse, with notes):

1. **Vehicle is fine.** Phaser 3 + Electron is the right pick — Electron gives us native subprocess spawning for Claude/Cursor CLIs, Phaser handles 2D isometric well. No reason to rewrite.
2. **Sim ↔ presentation separation.** Done in spirit: zustand store is the sim state, Phaser scenes read from it. **Gap:** no "fake loop" — we can only iterate the game feel with real agent events, which costs tokens. Adding a fixture/replay mode would unlock fast iteration.
3. **Vertical slice over full RTS.** Loop today: spawn agent → unit appears → tool calls animate → chat reflects. **Gaps:** no win/lose, no resource economy, no inter-unit interaction. Resist adding more axes until the existing loop is *fun*.
4. **Steal workflow, not art.** Doing this — drawn primitives + override pipeline so users can drop their own assets. Don't invest in custom art until the loop holds attention.
5. **The angle is emergent agent weirdness.** Don't try to balance like a traditional RTS — the entertainment value is watching real agents do unexpected things. Lean into that with surfaces (logs, replays, leaderboards of weirdness).
6. **Pin tool versions.** Bun-managed; should add a `.tool-versions` (mise/asdf) for `bun` so collaborators don't fight version drift.

## Big rocks (highest leverage next)

### B1. Fixture / replay mode
- Add a "spawn fake agent" path that emits scripted AgentEvent sequences (idle → tool_use → tool_result → assistant_text → session_end) on a timer.
- Lets us iterate animations / chat layout / sound timing without burning tokens.
- File: `src/main/adapters/fixture.ts`, plus a "FAKE" tab in the CommandInput tool selector.
- Bonus: persist a real session's events to JSON, load it back as a replay.

### B2. Cursor assistant text from `agentKv:blob:*`
- Schema discovered: global `cursorDiskKV` table, key prefix `agentKv:blob:`, JSON value with canonical AI-SDK shape (`{role, content[{type:"text"|"tool-call"|"tool-result"|"reasoning",...}]}`).
- Strategy: snapshot existing keys on startup as baseline, poll for new keys on each tick, parse + emit. Associate to workspace by checking blob content for cwd path strings (or by recency-of-write across workspaces).
- File: extend `src/main/adapters/cursor.ts`.

### B3. Subagent visualization
- When `Task` / `Agent` tool fires, draw a parent → child summon line, spawn a smaller sprite at the parent's position, link them logically.
- Add `parentSessionId` to AgentEvent payload (already in shape).
- Phaser: orbit child around parent; despawn on parent session_end.

### B4. Cursor chat-stream rendering polish
- User reports chunks still split a bit; investigate further. Could be from multiple `assistant` messages per turn (intro + main + outro). Possible: coalesce consecutive `assistant_text` events from the same session within a short window.

## Polish

- **P1.** Filter out our own dev session noise from the chat (the user's active claude window streaming Bash dumps into Riku's bubble).
- **P2.** `.tool-versions` file pinning bun, so the dev experience is reproducible.
- **P3.** Original sprite-PNG generator (node-canvas script) — produce actual files of the drawn silhouettes so the spritesheet path lights up without IP scraping.
- **P4.** "Open assets folder" button — Finder shortcut to `assets/sprites/kh/` so drag-drop is one click.
- **P5.** Mute persistence verified across reload (it does, via localStorage; just confirm).
- **P6.** Topbar "current claude session" indicator — explicit "you are this Riku" badge so the user knows that's their own window.
- **P7.** README — minimal one-pager: what it is, `bun install`, `bun run dev`, drop-zones for sprites/sounds, troubleshooting.
- **P8.** First commit. Repo is uncommitted.

## Stretch / longer-term

- **S1.** Outbound MCP server — expose kh-rts events/commands via MCP so other AI agents can read the world or spawn units. Different feature from passive monitoring.
- **S2.** Win/lose conditions — "tool budget" or "task complete" framing. Maybe: defeat a Heartless (a stuck task) by sending the right unit type.
- **S3.** Resource/economy — token usage as currency, MP regenerates over time, certain tools cost more.
- **S4.** Voice/SFX pack pipeline — KH menu chime, command-confirm beep. Drop-in via `assets/sounds/kh/`. Convention is wired; users provide audio.
- **S5.** Multi-window — each agent's chat in a detachable popout, drag a unit out of the gummi map.
- **S6.** Cloud playback / share-able recordings — record an agent run, replay later. Pairs with B1 fixture mode.
- **S7.** Cursor IDE extension — an actual VS Code-style extension that pushes Composer events to our socket instead of polling. Eliminates SQLite tail. Cleanest in theory, real engineering project.

## Operational

- **O1.** Git init + first commit. Suggested message: `feat: kh-rts MVP — Electron + Phaser + Streamdown chat + claude/cursor adapters`.
- **O2.** Add `.tool-versions` (`bun 1.3.x`) for mise/asdf users.
- **O3.** Pre-commit: typecheck + build smoke. Husky + lint-staged is heavy; a tiny `bin/precommit` script runs `bun run typecheck` and exits non-zero on failure.
- **O4.** Skill-install hygiene: use `bin/skills-add` (already shipped) to keep .agents-mirror dirs from scattering on every `npx skills add`.

## Recommended next sequence

1. **B1 (fixture mode)** — unblocks fast iteration on visual + chat polish without API costs.
2. **B4 (cursor chat polish)** — finishes the "looks great in the chat" story.
3. **P7 + O1 (README + first commit)** — repo is shareable.
4. **B3 (subagent viz)** — high visual payoff once we have fixture data to drive it.
5. **B2 (cursor assistant text)** — completes passive Cursor parity.

After that, decide whether to push on stretch items (outbound MCP / win conditions / etc.) or call the project "done enough" as a personal-fun experience and stop.
