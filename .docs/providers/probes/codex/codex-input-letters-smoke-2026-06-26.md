# Probe: Codex Input Letters Smoke

**Date:** 2026-06-26
**Scope:** Local Realmkeeper dev app smoke for Codex app-server user input and MCP elicitation letters.

## Commands

- `bun run dev`
- `agent-browser --session rk-current connect 9222`
- `agent-browser --session rk-current snapshot -i`
- `agent-browser --session rk-current check @...`
- `bun run test src/renderer/src/store-ingest.test.ts src/renderer/src/store-domain/event-reducer.test.ts`

## Findings

- The `Codex · answer letters` fixture launches from the Demos panel and emits two `user_input_request` events for one Codex session.
- Realmkeeper renders both letters at the same time:
  - `needs your answer` with a required single-select option and optional text note.
  - `needs MCP input` with required radios, optional multi-select labels, and `accept` / `decline` actions.
- The normal answer button starts disabled, enables after the required option is selected, and dismisses the letter on submit.
- The MCP `accept` button starts disabled, enables only after required `repository` and `notify` fields are selected, and dismisses the letter on accept.
- Browser automation attached to Electron reported `document.hidden: true`; the prior store batching used only `requestAnimationFrame`, so queued events did not flush in that hidden state. A timeout fallback is required for background/hidden renderer ingestion.

## Coverage Gaps

- This smoke used fixture events, not a live Codex app-server turn from the installed CLI.
- The UI accept path was exercised manually; the decline path is covered by reducer tests and should get an explicit UI smoke when the fixture harness supports one-click scenario variants.
