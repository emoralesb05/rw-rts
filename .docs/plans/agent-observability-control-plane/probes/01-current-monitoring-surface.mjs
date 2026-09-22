#!/usr/bin/env node

/**
 * Probe 01 — What can the shipped monitoring surface actually see and retain?
 * Touches: src/shared/trace-monitors.ts, src/renderer/src/store-domain/event-reducer.ts, src/renderer/src/ui/floating/KingdomPanelBody.tsx, src/main/trace-store.ts, src/main/provider-sessions.ts, src/shared/session-capabilities.ts
 * Hypothesis H6/H7: monitoring is renderer-window-bound, inventory is two-provider, and interventions already have a typed capability model.
 * PASS = the script reports the exact monitor kinds, event/list bounds, provider coverage, and control names found in source.
 * FAIL = any expected source contract cannot be parsed or the observed shape differs.
 * Capability: pure source inspection; exits non-zero instead of degrading when a file or contract is missing.
 * Shared state: none.
 * Self-contained: reads repository files and writes nothing.
 * Run: node .docs/plans/agent-observability-control-plane/probes/01-current-monitoring-surface.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const monitors = read("src/shared/trace-monitors.ts");
const reducer = read("src/renderer/src/store-domain/event-reducer.ts");
const panel = read("src/renderer/src/ui/floating/KingdomPanelBody.tsx");
const traceStore = read("src/main/trace-store.ts");
const providerSessions = read("src/main/provider-sessions.ts");
const capabilities = read("src/shared/session-capabilities.ts");

function requiredMatch(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) throw new Error(`could not parse ${label}`);
  return match;
}

const monitorKindsBlock = requiredMatch(
  monitors,
  /export type TraceMonitorKind\s*=([\s\S]*?);/,
  "TraceMonitorKind",
)[1];
const monitorKinds = [...monitorKindsBlock.matchAll(/"([a-z_]+)"/g)].map(
  (match) => match[1],
);
const maxEvents = Number(
  requiredMatch(reducer, /const MAX_EVENTS = (\d+);/, "MAX_EVENTS")[1],
);
const listBounds = [...panel.matchAll(/\.slice\(0,\s*(\d+)\)/g)].map((match) =>
  Number(match[1]),
);
const controlsBlock = requiredMatch(
  capabilities,
  /export const SESSION_CONTROL_NAMES = \[([\s\S]*?)\] as const/,
  "SESSION_CONTROL_NAMES",
)[1];
const controls = [...controlsBlock.matchAll(/"([A-Za-z]+)"/g)].map(
  (match) => match[1],
);

const result = {
  monitorKinds,
  monitorThresholdsAreHardCoded: [
    "DEFAULT_WAIT_MS",
    "DEFAULT_SLOW_TOOL_MS",
    "DEFAULT_STALE_TRACE_MS",
    "DEFAULT_RECENT_ERROR_WINDOW_MS",
  ].every((name) => monitors.includes(`const ${name}`)),
  rendererEventWindow: maxEvents,
  observatoryListBounds: [...new Set(listBounds)].sort((a, b) => a - b),
  observatoryProjectsRendererEvents: panel.includes("projectTraces(events)"),
  traceStoreAppendsWholeTraceSnapshots:
    traceStore.includes("appendFile(path, JSON.stringify(trace)") &&
    traceStore.includes("events.push(event)"),
  traceStoreHydratesAtStartup:
    /startTraceStore[\s\S]*loadTraceDay/.test(traceStore),
  providerInventory: {
    implemented: ["claude", "codex"].filter((tool) =>
      providerSessions.includes(`tool === "${tool}"`),
    ),
    missing: ["cursor", "gemini"].filter((tool) =>
      providerSessions.includes("not_implemented") &&
      providerSessions.includes(`"${tool}"`),
    ),
  },
  sessionControls: controls,
};

const expected =
  JSON.stringify(result.monitorKinds) ===
    JSON.stringify(["waiting", "slow_tool", "stale_trace", "error_trace"]) &&
  result.monitorThresholdsAreHardCoded &&
  result.rendererEventWindow === 500 &&
  result.observatoryProjectsRendererEvents &&
  result.traceStoreAppendsWholeTraceSnapshots &&
  !result.traceStoreHydratesAtStartup &&
  result.providerInventory.implemented.length === 2 &&
  result.providerInventory.missing.length === 2 &&
  result.sessionControls.length === 10;

console.log(JSON.stringify({ ok: expected, ...result }, null, 2));
if (!expected) process.exitCode = 1;
