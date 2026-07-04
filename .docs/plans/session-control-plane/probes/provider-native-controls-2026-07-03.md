# Probe P1: Provider-native Controls

**Question:** Which provider-native fork, attach, list, and interrupt controls are stable enough for Realmkeeper to implement next?

**Pass/fail:** Pass if a provider exposes a documented command/protocol, the installed CLI confirms it, and the control can be scoped without a live model turn. Fail or defer if the only path is an IDE-only UI, unsupported account tier, or unproven live mutation.

**Date:** 2026-07-03 local, results generated at 2026-07-04T02:51Z UTC.

## Setup

- Repo: `/Users/ed/Github/emoralesb05/rw-rts`
- Probe runner: `node .docs/plans/session-control-plane/probes/provider-native-controls-2026-07-03.mjs`
- Full redacted output: `/var/folders/pv/72jzwr1x1bvbtrfx57539wlr0000gn/T/rw-rts-provider-native-controls-2026-07-03/results.json`
- Generated Codex schema: `/var/folders/pv/72jzwr1x1bvbtrfx57539wlr0000gn/T/rw-rts-provider-native-controls-2026-07-03/codex-schema/`

The probe ran bounded help/status/list commands only. It did not start a model turn, create a chat, stop a session, or delete anything.

## Commands

```bash
claude --version
claude --help
claude agents --help
claude agents --json
claude agents --json --all
claude daemon status
claude attach --help
claude logs --help
claude stop --help
claude respawn --help
claude remote-control --help
claude auth status

codex --version
codex app-server --help
codex app-server generate-json-schema --experimental --out <tmp>/codex-schema
codex app-server daemon --help
codex app-server daemon version
codex fork --help
codex resume --help
codex remote-control --help
codex debug app-server send-message-v2 --help

cursor-agent --version
cursor-agent --help
cursor-agent create-chat --help
cursor-agent resume --help
cursor-agent ls --help
cursor-agent models --help
cursor-agent status
cursor-agent about
cursor-agent models

gemini --version
gemini --help
gemini --list-sessions
```

## Findings

### P1-F1 - Codex app-server list/fork/read controls are ticketable [measured]

`codex-cli 0.142.5` generated an experimental app-server JSON Schema that includes `thread/list`, `thread/loaded/list`, `thread/turns/list`, `thread/turns/items/list`, `thread/read`, `thread/fork`, `thread/resume`, `turn/steer`, and `turn/interrupt`. The generated `ThreadListParams` supports filters for cwd, source kind, provider, archived state, parent thread, search term, pagination, and sort order. The generated `ThreadForkParams` prefers `threadId`, supports `cwd`, `sandbox`, `approvalPolicy`, `permissions`, `runtimeWorkspaceRoots`, and `excludeTurns`.

Official Codex docs also describe app-server as JSON-RPC over stdio/websocket/unix socket and document `thread/start`, `thread/resume`, `thread/fork`, `turn/start`, `turn/steer`, and `turn/interrupt`. Local help confirms `codex fork [SESSION_ID] [PROMPT]`, `codex resume [SESSION_ID] [PROMPT]`, and `codex remote-control start|stop`.

Decision: implement Codex `listProviderSessions` from app-server `thread/list` first, then Codex `fork` through app-server `thread/fork`. Keep shell `codex fork` as a fallback only for a known session id. Do not manage the app-server daemon unless Realmkeeper explicitly owns that lifecycle; this install has `daemon start|stop|version` but no `daemon status`, and `daemon version` fails when the control socket is absent.

Sources:
- <https://developers.openai.com/codex/codex-manual.md>
- Local generated schema under `<tmp>/codex-schema/`

### P1-F2 - Claude background discovery/attach/logs is ticketable with kind gating [measured]

`claude 2.1.200` exposes `--bg`, `claude agents --json`, `claude agents --json --all`, `claude attach <id>`, `claude logs <id>`, `claude stop <id>`, `claude respawn <id>|--all`, `claude daemon status`, and `claude remote-control`. Official docs describe the same commands and note `claude agents --json --all` includes completed background sessions.

The local read-only probe showed `claude agents --json --all` returns active sessions with `pid`, `cwd`, `kind`, `startedAt`, `sessionId`, `name`, and `status`. It also showed `claude auth status` succeeds on this machine. `claude daemon status` exited 1 because the background-session supervisor was not running.

Decision: implement Claude provider-session discovery from `claude agents --json --all`, render provider-native attach/logs actions for discoverable sessions, and gate stop/respawn to sessions whose `kind` and status match Claude's background-session contract. Do not call this live interrupt for arbitrary observed interactive TUIs.

Sources:
- <https://code.claude.com/docs/en/cli-reference>
- Local probe output

### P1-F3 - Cursor headless chat controls work, but IDE control remains observe-only [measured]

`cursor-agent 2026.06.26-7079533` exposes `create-chat`, `resume`, `ls`, and `models`. The local account is authenticated enough for `cursor-agent status`, `cursor-agent about`, and `cursor-agent models`. The API-backed model list succeeded.

No probe found a provider-native command that attaches to a live Cursor IDE agent, injects into the IDE input, or authoritatively answers IDE permission prompts. This matches Realmkeeper's existing provider docs: CLI resume is usable for known chat ids, while the IDE remains observe-only.

Decision: keep Cursor provider controls to observed chat resume/send plus optional `cursor-agent ls` discovery once its non-interactive output is fixture-tested. Do not expose Cursor attach, interrupt, or permission control as authoritative.

Sources:
- <https://cursor.com/docs>
- Local `cursor-agent` help/status/about/models output

### P1-F4 - Gemini ACP has the right primitives but is auth-gated here [measured]

`gemini 0.47.0` still exposes `--acp`, `--session-id`, `--resume`, and `--list-sessions`. Official Gemini CLI docs describe ACP mode as stdio JSON-RPC and list `initialize`, `authenticate`, `newSession`, `loadSession`, `prompt`, `cancel`, `setSessionMode`, and `unstable_setSessionModel`.

The local `gemini --list-sessions` command exited 0 and printed `No previous sessions found for this project`, but stderr also reported `IneligibleTierError` / `UNSUPPORTED_CLIENT` for Gemini Code Assist for individuals and directed migration to Antigravity. Official auth docs still list Google sign-in for local use, API key or Vertex for headless mode, and paid Google AI Pro/Ultra or Workspace as eligible account paths.

Decision: keep the current Gemini prompt/resume/list diagnostics. Defer Gemini ACP implementation until a supported headless auth path is verified on this machine with API key, Vertex, or an eligible Google sign-in. Once auth is available, ACP `cancel` is the first live-interrupt candidate.

Sources:
- <https://geminicli.com/docs/cli/acp-mode/>
- <https://geminicli.com/docs/cli/tutorials/session-management/>
- <https://geminicli.com/docs/get-started/authentication/>
- Local probe output

## Implementation Tickets Unblocked

1. Codex provider-session list: add app-server `thread/list` client method, normalize rows into Realmkeeper provider-session diagnostics, and expose `listProviderSessions` for Codex.
2. Codex fork: add app-server `thread/fork` client method, create a new wielder/unit for the returned thread, and route an optional prompt as the first turn.
3. Claude provider-session list: parse `claude agents --json --all`, map `sessionId`, `cwd`, `kind`, `status`, `name`, and `pid`, and show attach/logs actions.
4. Claude background attach/logs/stop gating: add command builders and typed IPC responses; stop/respawn only when the session is background-managed and the UI labels it as provider-native.
5. Cursor discovery hardening: fixture-test `cursor-agent ls` before exposing it; keep IDE attach/injection unavailable.
6. Gemini ACP spike: blocked until auth is verified; probe `initialize`, `authenticate`, `newSession`, `prompt`, and `cancel` without file writes.

## What This Does Not Validate

- No disposable Claude background session was started or stopped, so provider-native Claude stop/respawn remains gated to a future fixture or explicit live probe.
- No Codex live `thread/list` or `thread/fork` request was sent to a running app-server in this pass; the schema and docs prove contract shape, not runtime behavior.
- Cursor `ls` was not run without a TTY in this pass, so output shape still needs a fixture before UI listing.
- Gemini ACP was not started because current OAuth/account-tier state is not enough for headless live work.
