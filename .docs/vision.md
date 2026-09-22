# Realmkeeper - Vision

Current north star for Realmkeeper. Historical Q1-Q44 decisions, old phase
notes, and long backlog context live in [`./archive/decisions.md`](./archive/decisions.md).

For shipped changes, see [`../CHANGELOG.md`](../CHANGELOG.md).
For implementation details, see [`./architecture/`](./architecture/) and
[`./providers/`](./providers/).
For active implementation plans, see [`./plans/`](./plans/).
For vocabulary, see [`./glossary.md`](./glossary.md).

> Repo directory name is the checkout owner's call. The npm package and app
> identity are `realmkeeper`.

## North Star

Realmkeeper is a Realm Wardens-themed agent watch room: a local monitoring
cockpit where the King sees every coding agent, notices which sessions need
attention, inspects what happened, and intervenes safely. The Realm Wardens
Star Chart remains the atmospheric view of the same real state.

It should feel like a quiet command room, not a terminal wrapper and not a
traditional RTS. Monitoring is the primary workflow; the player nudges,
dispatches, approves, comforts, recalls, and seals work only when needed.
Agents keep their own agency.

## Product Shape

- **Audience**: personal-tidy, macOS-first, built for one power user running
  multiple local AI coding tools.
- **Primary operational screen**: a React Monitor workspace with Attention,
  Fleet, Inspector, Usage, and Integrations views.
- **Realm view**: the unified Phaser Star Chart with repo-worlds, wardens,
  riftlings, ambient effects, and camera pan/zoom.
- **HUD**: React overlay with party roster, alerts, activity log, letters,
  selected-world commands, floating panels, and right-edge chat drawer.
- **Providers**: Claude, Codex, Cursor, and Gemini through installed hooks,
  transcript/watch streams, and provider-specific spawn/resume adapters;
  optional metadata-only sources may surface other agents without granting
  provider controls.
- **Permissions**: Realmkeeper-local saved rules in
  `~/.realmkeeper/permissions.json`; Claude/Codex/Gemini can be answered
  directly, Cursor remains observe-only in normal allowlist mode.
- **Persistence**: lightweight JSON state in `~/.realmkeeper/state.json` for
  kingdom memory, standing orders, world stats, and warden stats.

## Core Loop

```
Survey -> Notice -> Dive -> Intervene -> Witness -> Survey
```

- **Survey**: watch all repo-worlds and active wardens at a glance.
- **Notice**: letters, alerts, activity rows, and visual pulses pull attention.
- **Dive**: focus a world or warden without leaving the map.
- **Intervene**: dispatch, send word, decree, comfort, recall, approve, or deny.
- **Witness**: read results, follow subagents, and seal completed worlds.

The app should work from peripheral vision. If the user has to stare at it to
understand whether anything needs action—or cannot tell why Realmkeeper thinks
an agent is blocked, working, done, or unknown—the design failed.

## Player Verbs

| Verb | Real action |
|---|---|
| Dispatch | Spawn a Claude, Codex, Cursor, or Gemini session in a repo |
| Send word | Send a gentle follow-up prompt to a warden |
| Decree | Send a directive prompt, optionally as a standing order |
| Comfort | Restore a struggling warden's HP/MP as game framing |
| Recall | Stop a Realmkeeper-spawned session |
| Seal | Mark a repo-world's work as done |

Permission allow/deny is an attention flow, not a fantasy verb, but it must stay
first-class because it blocks real tools.

## Current Decisions

- One unified Star Chart scene replaces the older Throne / Realm / Arena split.
- React owns HUD and panels; Phaser owns world rendering and camera motion.
- Camera movement is explicit: drag, scroll, world selection, or row/card focus.
- The app stays single-user and local-first until a real shared-workflow need
  appears.
- Monitoring state must name its source, freshness, and confidence. Missing
  evidence is unknown, not idle or successful.
- The Star Chart is an optional Realm view of the same monitor state, not the
  only place to understand the fleet.
- Cursor permissions are observe-only unless Cursor exposes an authoritative
  external approval contract for the mode we use.
- Provider-native permission config mirroring is deferred and must be an
  explicit per-provider opt-in.
- Public-distribution hardening comes before broader packaging work.

## Non-Goals

- Hosted multi-tenant SaaS.
- Mobile companion or PWA.
- Tick-by-tick RTS micromanagement.
- Integrated PTY terminal in the HUD.
- Shared kingdoms or team rooms.
- Achievement/skin gamification.
- Cross-platform polish beyond keeping the app reasonably portable.

## Visual Direction

Distinctive atmospheric 2D: painterly high-resolution warden sprites, pixel-art
riftlings and landmarks, isometric repo-worlds, per-world atmospherics, and a
global CRT/bloom/vignette treatment. The visual layer should reveal actual agent
state instead of becoming decorative noise.

## Current Status

The active [agent monitoring control-plane plan](./plans/agent-observability-control-plane/)
makes Monitor the primary operational workspace while retaining the Star Chart
as Realm view. Completed provider hardening decisions live in
[`./providers/`](./providers/), and durable architecture behavior lives in
[`./architecture/`](./architecture/).

Shipped foundations:

- primary React Monitor workspace with Attention, Fleet, Inspector, source
  evidence, capability-gated controls, and a remembered Realm switch
- main-process monitor reconciliation across Realmkeeper events, Claude/Codex
  inventories, and optional metadata-only Herdr presence/focus
- unified Star Chart and HUD layout
- local provider hooks and installers
- saved Realmkeeper-local permission rules
- provider docs and probe evidence
- direct messaging/resume paths where providers allow it
- Electron renderer guardrails around navigation, sandboxing, IPC sender origin,
  request schemas, and response schemas
- Playwright Electron smoke coverage for shell, settings, provider connection
- status, dispatch, chat, world commands, provider fixture turns, provider
  prompt IPC, Codex answer/MCP letters, actionable Claude/Codex/Gemini
  permission cards, and Cursor observe-only permission cards
- Codex app-server request parity for user input, MCP URL/form elicitations,
  schema-compatible OpenAI forms, decline/cancel-only requests, and dynamic-tool
  allowlist gating
- Lazy chat markdown rendering: Streamdown plus Mermaid/math/Shiki plugins load
  from the markdown renderer chunk instead of the conversation stream module

## Next Hardening

Highest-value follow-ups:

- add durable metadata history, attention acknowledgement/snoozing, and
  provider-reported usage rollups to the shipped monitoring control plane
- add an Antigravity inventory adapter as Google's personal CLI workflow moves
  away from Gemini CLI; retain Gemini support for enterprise/API-key users
- expand Electron smoke coverage into failure states and visual regression
  snapshots
- capture or synthesize a provider-faithful Claude deferred
  `AskUserQuestion` resume fixture; the implemented answer-letter path is still
  synthetic-only because the live CLI probe did not expose the tool
- keep renderer cold-start bundle size measured as new UI chunks land
- keep Cursor observe-only UX explicit and low-confusion
- keep IPC schema coverage mandatory as new channels are added
- revisit provider-native permission mirroring only as an opt-in after local
  rules prove stable

These are implementation tracks, not standing plans. When one starts, put the
temporary plan in [`./plans/`](./plans/) and delete or archive it once shipped.
