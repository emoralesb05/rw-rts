#!/usr/bin/env node
import { spawn } from "node:child_process";

const cwd = process.cwd();
const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 180000);
const prompt =
  "Reply with exactly realmkeeper-claude-rich-stream-probe and do not use tools.";
const args = [
  "-p",
  prompt,
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-hook-events",
  "--include-partial-messages",
  "--prompt-suggestions",
  "--tools",
  "",
  "--no-session-persistence",
];

const startedAt = Date.now();
const child = spawn("claude", args, {
  cwd,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env },
});

let stdoutCarry = "";
let stderrCarry = "";
const parseErrors = [];
const stderrLines = [];
const samplesByType = new Map();
const countsByType = new Map();
const assistantText = [];
const promptSuggestions = [];
let resultText;
let timedOut = false;

const timer = setTimeout(() => {
  timedOut = true;
  child.kill("SIGTERM");
}, timeoutMs);

child.stdout?.on("data", (chunk) => {
  stdoutCarry += chunk.toString("utf8");
  drainStdout(false);
});

child.stderr?.on("data", (chunk) => {
  stderrCarry += chunk.toString("utf8");
  drainStderr(false);
});

const exit = await new Promise((resolve) => {
  child.on("exit", (code, signal) => resolve({ code, signal }));
  child.on("error", (error) => resolve({ code: null, signal: null, error }));
});

clearTimeout(timer);
drainStdout(true);
drainStderr(true);

const summary = {
  status: timedOut ? "timeout" : exit.code === 0 ? "completed" : "error",
  exit,
  cwd,
  args: args.map((arg) => (arg === prompt ? "<probe prompt>" : arg)),
  durationMs: Date.now() - startedAt,
  countsByType: Object.fromEntries(countsByType),
  samplesByType: Object.fromEntries(samplesByType),
  assistantText,
  resultText,
  promptSuggestions,
  parseErrors,
  stderrLines,
};

console.log(JSON.stringify(summary, null, 2));
if (summary.status !== "completed") process.exitCode = 1;

function drainStdout(flush) {
  let nl;
  while ((nl = stdoutCarry.indexOf("\n")) !== -1) {
    const line = stdoutCarry.slice(0, nl);
    stdoutCarry = stdoutCarry.slice(nl + 1);
    handleStdoutLine(line);
  }
  if (flush && stdoutCarry.trim()) {
    handleStdoutLine(stdoutCarry);
    stdoutCarry = "";
  }
}

function drainStderr(flush) {
  let nl;
  while ((nl = stderrCarry.indexOf("\n")) !== -1) {
    const line = stderrCarry.slice(0, nl).trim();
    stderrCarry = stderrCarry.slice(nl + 1);
    if (line) stderrLines.push(line);
  }
  if (flush && stderrCarry.trim()) {
    stderrLines.push(stderrCarry.trim());
    stderrCarry = "";
  }
}

function handleStdoutLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (error) {
    parseErrors.push({
      message: error instanceof Error ? error.message : String(error),
      line: trimmed.slice(0, 400),
    });
    return;
  }

  const type = typeof msg.type === "string" ? msg.type : "unknown";
  countsByType.set(type, (countsByType.get(type) ?? 0) + 1);
  const samples = samplesByType.get(type) ?? [];
  if (samples.length < 3) {
    samples.push(summarizeMessage(msg));
    samplesByType.set(type, samples);
  }
  collectText(msg, type);
}

function summarizeMessage(msg) {
  const message = record(msg.message);
  const event = record(msg.event);
  const hookEvent = record(msg.hook_event);
  const content = Array.isArray(message?.content) ? message.content : undefined;
  return {
    keys: Object.keys(msg).sort(),
    subtype: stringValue(msg.subtype) ?? stringValue(msg.event),
    eventType: stringValue(event?.type),
    eventKeys: event ? Object.keys(event).sort() : undefined,
    hookEventName: stringValue(msg.hook_event_name),
    hookEventKeys: hookEvent ? Object.keys(hookEvent).sort() : undefined,
    hookName: stringValue(msg.hook_name),
    messageKeys: message ? Object.keys(message).sort() : undefined,
    contentTypes: content?.flatMap((block) => {
      const entry = record(block);
      return entry?.type ? [entry.type] : [];
    }),
    resultType: typeof msg.result,
    suggestionKeys: record(msg.suggestion)
      ? Object.keys(record(msg.suggestion) ?? {}).sort()
      : undefined,
  };
}

function collectText(msg, type) {
  const message = record(msg.message);
  const content = Array.isArray(message?.content) ? message.content : [];
  for (const block of content) {
    const entry = record(block);
    if (entry?.type === "text" && typeof entry.text === "string") {
      assistantText.push(entry.text);
    }
  }
  if (type === "result" && typeof msg.result === "string") {
    resultText = msg.result;
  }
  if (type === "prompt_suggestion") {
    const suggestion =
      stringValue(msg.suggestion) ??
      stringValue(record(msg.suggestion)?.prompt) ??
      stringValue(msg.prompt);
    if (suggestion) promptSuggestions.push(suggestion);
  }
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function stringValue(value) {
  return typeof value === "string" && value ? value : undefined;
}
