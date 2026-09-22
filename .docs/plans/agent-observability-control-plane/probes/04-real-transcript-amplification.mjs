#!/usr/bin/env bun

/**
 * Probe 04 — Does snapshot amplification persist on real local provider transcript shapes?
 * Touches: src/shared/traces.ts, src/main/trace-store.ts
 * Hypothesis H9: on real transcript-derived assistant events, appending the full projected trace after every event uses more bytes than appending each normalized event once.
 * PASS = at least three real sessions with five parsed assistant events are measured, all generated snapshots parse, and aggregate amplification is >1x.
 * FAIL = local transcripts are unavailable/insufficient, parsing or projection fails, or snapshot bytes do not exceed event bytes.
 * Capability: requires existing local Claude/Codex transcript files; exits non-zero rather than substituting fixtures.
 * Shared state: read-only provider transcript files; no content, path, cwd, or session id is printed.
 * Self-contained: reads at most 50 MiB across the newest bounded files and writes nothing.
 * Run: bun .docs/plans/agent-observability-control-plane/probes/04-real-transcript-amplification.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { projectTraces } from "../../../../src/shared/traces.ts";

const MAX_FILES = 80;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_SESSIONS = 12;
const MIN_EVENTS = 5;

function walk(root, depth = 0) {
  if (!existsSync(root) || depth > 6) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(path, depth + 1));
    else if (entry.name.endsWith(".jsonl")) {
      const stat = statSync(path);
      if (stat.size <= MAX_FILE_BYTES) files.push({ path, ...stat });
    }
  }
  return files;
}

function event(tool, sessionId, timestamp, text) {
  return {
    sessionId,
    tool,
    cwd: "/redacted",
    repoRoot: "/redacted",
    timestamp,
    kind: "assistant_text",
    payload: { text },
    source: "hook",
  };
}

function parseLine(tool, line, fallbackTimestamp) {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  if (tool === "claude") {
    if (record?.type !== "assistant" || !Array.isArray(record?.message?.content)) {
      return null;
    }
    const text = record.message.content
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n\n");
    if (!text) return null;
    const parsedTimestamp =
      typeof record.timestamp === "number"
        ? record.timestamp
        : Date.parse(record.timestamp ?? "");
    return {
      text,
      timestamp: Number.isFinite(parsedTimestamp)
        ? parsedTimestamp
        : fallbackTimestamp,
    };
  }
  if (
    record?.type === "item.completed" &&
    record?.item?.type === "agent_message" &&
    typeof record.item.text === "string"
  ) {
    return { text: record.item.text, timestamp: fallbackTimestamp };
  }
  if (
    record?.type === "response_item" &&
    record?.payload?.type === "message" &&
    record.payload.role === "assistant" &&
    record.payload.phase === "final_answer" &&
    Array.isArray(record.payload.content)
  ) {
    const text = record.payload.content
      .filter(
        (item) =>
          item?.type === "output_text" && typeof item.text === "string",
      )
      .map((item) => item.text)
      .join("\n\n");
    return text ? { text, timestamp: fallbackTimestamp } : null;
  }
  return null;
}

const roots = [
  { tool: "claude", root: join(homedir(), ".claude", "projects") },
  { tool: "codex", root: join(homedir(), ".codex", "sessions") },
];
const candidates = roots
  .flatMap(({ tool, root }) => walk(root).map((file) => ({ tool, ...file })))
  .sort((a, b) => b.mtimeMs - a.mtimeMs)
  .slice(0, MAX_FILES);

let bytesRead = 0;
const sessions = [];
for (const candidate of candidates) {
  if (sessions.length >= MAX_SESSIONS) break;
  if (bytesRead + candidate.size > MAX_TOTAL_BYTES) continue;
  bytesRead += candidate.size;
  const lines = readFileSync(candidate.path, "utf8").split("\n");
  const sessionId = `real-${candidate.tool}-${sessions.length}`;
  const events = [];
  let sequence = 0;
  for (const line of lines) {
    if (!line) continue;
    const parsed = parseLine(
      candidate.tool,
      line,
      candidate.mtimeMs + sequence,
    );
    if (parsed) {
      events.push(
        event(candidate.tool, sessionId, parsed.timestamp, parsed.text),
      );
      sequence += 1;
    }
  }
  if (events.length >= MIN_EVENTS) {
    sessions.push({ tool: candidate.tool, events });
  }
}

let eventBytes = 0;
let snapshotBytes = 0;
let eventCount = 0;
let parsedSnapshots = 0;
const byProvider = {};
for (const session of sessions) {
  byProvider[session.tool] = (byProvider[session.tool] ?? 0) + 1;
  const seen = [];
  for (const item of session.events) {
    seen.push(item);
    eventBytes += Buffer.byteLength(JSON.stringify(item)) + 1;
    eventCount += 1;
    const line = JSON.stringify(projectTraces(seen)[0]);
    snapshotBytes += Buffer.byteLength(line) + 1;
    JSON.parse(line);
    parsedSnapshots += 1;
  }
}

const amplification = eventBytes > 0 ? snapshotBytes / eventBytes : 0;
const ok =
  sessions.length >= 3 &&
  eventCount >= sessions.length * MIN_EVENTS &&
  parsedSnapshots === eventCount &&
  amplification > 1;

console.log(
  JSON.stringify(
    {
      ok,
      sessions: sessions.length,
      byProvider,
      eventCount,
      bytesRead,
      eventBytes,
      snapshotBytes,
      amplification: Number(amplification.toFixed(2)),
      parsedSnapshots,
      privacy: "aggregate-only output; identifiers and content omitted",
    },
    null,
    2,
  ),
);
if (!ok) process.exitCode = 1;
