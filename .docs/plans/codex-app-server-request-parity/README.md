# Codex App-Server Request Parity

> **Status:** 🔬 Researched
> **Owner:** Realmkeeper
> **Drafted:** 2026-07-02
> **Last updated:** 2026-07-02
> **Engineer profile:** Senior TypeScript/Electron provider-adapter engineer. Read `src/main/adapters/codex-app-server.ts`, `src/main/adapters/user-input-bridge.ts`, `src/shared/events.ts`, and the renderer letter flow before editing.
> **Effort:** 5 focused slices
> **Scope:** Make every Codex app-server server request either actionable in Realmkeeper or visibly declined with enough context to debug.

## Evidence

- OpenAI Codex manual fetch on 2026-07-02 documents `codex app-server` as an experimental JSON-RPC surface with generated TypeScript/JSON-schema support.
- Local `codex app-server generate-json-schema` on `codex-cli 0.142.5` shows six v1 server request methods: command approval, file approval, permission approval, user-input request, MCP elicitation, and dynamic tool call.
- The generated MCP elicitation schema has three modes: `form`, `openai/form`, and `url`. Realmkeeper currently supports typed `form`, while `url` and `openai/form` must decline until there is UI for them.
- The generated dynamic tool-call schema only supplies `namespace`, `tool`, `callId`, `threadId`, `turnId`, and arbitrary `arguments`; it does not define a safe execution contract.

## Decisions

- Keep fail-closed as the default for unknown app-server requests.
- Add visible diagnostics before adding new approvals or tool execution.
- Do not execute dynamic tool calls through a generic dispatcher. Add an explicit Realmkeeper allowlist before the first supported dynamic tool.
- Treat MCP URL elicitations as visible user requests first; acceptance needs an intentional browser/open-url completion path.
- Surface `openai/form` requests as decline/cancel-only until arbitrary form rendering exists. Typed `form` remains the only accepted MCP elicitation mode.

## Slices

- [x] Unsupported request context: error events include `payload.name` and compact `payload.input` for MCP elicitations, malformed user-input requests, and dynamic tool calls before declining.
- [x] MCP URL elicitation UI: render a visible letter with server name, message, and URL, plus decline/cancel actions; defer accept until the open-url completion flow is designed.
- [x] OpenAI form visibility: render `openai/form` requests as decline/cancel-only letters with server message and schema summary.
- [ ] OpenAI form acceptance UI: render `openai/form` requests or translate them into Realmkeeper questions with tests for required fields, defaults, and cancellation.
- [ ] Dynamic tool registry: add an allowlisted registry with per-tool tests and explicit decline for every unregistered tool.

## Acceptance Gates

- Unit tests cover all six Codex app-server request methods.
- MCP tests cover `form`, `url`, and `openai/form` modes.
- Dynamic tool calls remain declined unless the tool is registered and tested.
- Provider docs record the supported, observed, and fail-closed behavior.
- E2E coverage verifies unsupported requests are visible to the user and do not silently disappear.
