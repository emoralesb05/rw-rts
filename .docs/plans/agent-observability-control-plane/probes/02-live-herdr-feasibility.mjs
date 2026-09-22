#!/usr/bin/env node

/**
 * Probe 02 — Can Realmkeeper consume Herdr as a read-only optional presence source on this machine?
 * Touches: .docs/plans/agent-observability-control-plane/probes/02-live-herdr-feasibility.mjs
 * Hypothesis H8: Herdr exposes machine-readable live agent identity and lifecycle state without reading pane content.
 * PASS = `herdr agent list` returns JSON with at least one recognized agent, a documented status, and no pane content field.
 * FAIL = Herdr is absent, the server cannot be queried, JSON cannot be parsed, or the response contains pane content.
 * Capability: requires a running local Herdr server and socket access; exits non-zero rather than falling back to static docs.
 * Shared state: read-only access to the local Herdr socket.
 * Self-contained: invokes Herdr once and prints only aggregate counts; no prompts or provider calls.
 * Run: node .docs/plans/agent-observability-control-plane/probes/02-live-herdr-feasibility.mjs
 */

import { execFileSync } from "node:child_process";

const raw = execFileSync("herdr", ["agent", "list"], {
  encoding: "utf8",
  timeout: 8_000,
  stdio: ["ignore", "pipe", "pipe"],
});
const parsed = JSON.parse(raw);
const agents = parsed?.result?.agents;
if (!Array.isArray(agents)) throw new Error("Herdr response has no agent list");

const allowedStatuses = new Set(["idle", "working", "blocked", "done", "unknown"]);
const byAgent = {};
const byStatus = {};
let nativeSessionRefs = 0;
let contentFields = 0;
for (const agent of agents) {
  const kind = typeof agent.agent === "string" ? agent.agent : "unknown";
  const status =
    typeof agent.agent_status === "string" ? agent.agent_status : "unknown";
  byAgent[kind] = (byAgent[kind] ?? 0) + 1;
  byStatus[status] = (byStatus[status] ?? 0) + 1;
  if (agent.agent_session?.value) nativeSessionRefs += 1;
  for (const key of ["content", "output", "scrollback", "recent_lines"]) {
    if (key in agent) contentFields += 1;
  }
  if (!allowedStatuses.has(status)) {
    throw new Error(`undocumented Herdr agent status: ${status}`);
  }
}

const ok = agents.length > 0 && contentFields === 0;
console.log(
  JSON.stringify(
    {
      ok,
      agentCount: agents.length,
      byAgent,
      byStatus,
      nativeSessionRefs,
      contentFields,
    },
    null,
    2,
  ),
);
if (!ok) process.exitCode = 1;
