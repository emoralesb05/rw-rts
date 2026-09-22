#!/usr/bin/env bun

/**
 * Probe 03 — Does the current whole-trace-per-event JSONL format scale as monitoring history?
 * Touches: src/shared/traces.ts, src/main/trace-store.ts
 * Hypothesis H9: appending the full projected trace after every event uses at least 5x the bytes of appending each normalized event once.
 * PASS = a deterministic 12-session/25-turn fixture reports snapshot amplification >= 5x and parses every generated snapshot.
 * FAIL = amplification is below 5x, projection fails, or a generated record cannot be parsed.
 * Capability: Bun must load the repository TypeScript projector; exits non-zero if it cannot.
 * Shared state: none.
 * Self-contained: pure compute, no files or network.
 * Run: bun .docs/plans/agent-observability-control-plane/probes/03-trace-snapshot-amplification.mjs
 */

import { projectTraces } from "../../../../src/shared/traces.ts";

const SESSION_COUNT = 12;
const TURNS_PER_SESSION = 25;

function event(sessionId, timestamp, kind, payload = {}) {
  return {
    sessionId,
    tool: "codex",
    cwd: `/repo/${sessionId}`,
    repoRoot: `/repo/${sessionId}`,
    timestamp,
    kind,
    payload,
    source: "realmkeeper",
  };
}

let snapshotBytes = 0;
let eventBytes = 0;
let snapshotLines = 0;
let eventLines = 0;
let parsedSnapshots = 0;
const started = performance.now();

for (let session = 0; session < SESSION_COUNT; session += 1) {
  const sessionId = `scale-${session}`;
  const events = [event(sessionId, session * 1_000_000, "session_start")];
  for (let turn = 0; turn < TURNS_PER_SESSION; turn += 1) {
    const base = session * 1_000_000 + turn * 10_000;
    events.push(
      event(sessionId, base + 1, "user_prompt", { text: `task ${turn}` }),
      event(sessionId, base + 2, "tool_use", {
        name: "Bash",
        input: { command: "bun test" },
      }),
      event(sessionId, base + 3, "tool_result", {
        name: "Bash",
        output: { stdout: "tests passed" },
        durationMs: 800,
      }),
      event(sessionId, base + 4, "assistant_text", { text: `done ${turn}` }),
    );
  }
  events.push(
    event(sessionId, session * 1_000_000 + 999_999, "session_end", {
      output: { input_tokens: 12_000, output_tokens: 3_000 },
    }),
  );

  const seen = [];
  for (const item of events) {
    seen.push(item);
    const snapshot = projectTraces(seen)[0];
    const line = JSON.stringify(snapshot);
    snapshotBytes += Buffer.byteLength(line) + 1;
    snapshotLines += 1;
    JSON.parse(line);
    parsedSnapshots += 1;

    eventBytes += Buffer.byteLength(JSON.stringify(item)) + 1;
    eventLines += 1;
  }
}

const amplification = snapshotBytes / eventBytes;
const result = {
  ok: amplification >= 5 && parsedSnapshots === snapshotLines,
  sessions: SESSION_COUNT,
  turnsPerSession: TURNS_PER_SESSION,
  eventLines,
  snapshotLines,
  eventBytes,
  snapshotBytes,
  amplification: Number(amplification.toFixed(2)),
  elapsedMs: Number((performance.now() - started).toFixed(1)),
  parsedSnapshots,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
