#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const OUTPUT_DIR = join(
  tmpdir(),
  "rw-rts-provider-native-controls-2026-07-03",
);
const OUTPUT_FILE = join(OUTPUT_DIR, "results.json");
const TIMEOUT_MS = 8_000;

const commands = [
  ["claude", ["--version"]],
  ["claude", ["--help"]],
  ["claude", ["agents", "--help"]],
  ["claude", ["agents", "--json"]],
  ["claude", ["daemon", "status"]],
  ["claude", ["attach", "--help"]],
  ["claude", ["logs", "--help"]],
  ["claude", ["stop", "--help"]],
  ["claude", ["respawn", "--help"]],
  ["claude", ["remote-control", "--help"]],
  ["claude", ["auth", "status"]],
  ["codex", ["--version"]],
  ["codex", ["app-server", "--help"]],
  [
    "codex",
    [
      "app-server",
      "generate-json-schema",
      "--experimental",
      "--out",
      join(OUTPUT_DIR, "codex-schema"),
    ],
  ],
  ["codex", ["fork", "--help"]],
  ["codex", ["resume", "--help"]],
  ["codex", ["remote-control", "--help"]],
  ["codex", ["debug", "app-server", "send-message-v2", "--help"]],
  ["cursor-agent", ["--version"]],
  ["cursor-agent", ["--help"]],
  ["cursor-agent", ["create-chat", "--help"]],
  ["cursor-agent", ["resume", "--help"]],
  ["cursor-agent", ["ls", "--help"]],
  ["cursor-agent", ["models", "--help"]],
  ["cursor-agent", ["status"]],
  ["cursor-agent", ["about"]],
  ["gemini", ["--version"]],
  ["gemini", ["--help"]],
  ["gemini", ["--list-sessions"]],
];

function redact(text) {
  return text
    .replaceAll(process.env.HOME ?? "", "~")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .replace(/"orgId":\s*"[^"]+"/g, '"orgId": "<redacted>"')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>")
    .replace(/token["':= ]+[A-Za-z0-9._-]+/gi, "token=<redacted>")
    .trim();
}

function excerpt(text, limit = 2_400) {
  const clean = redact(text);
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit)}\n... <truncated>`;
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NO_COLOR: "1",
        CI: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
    }, TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        command,
        args,
        startedAt,
        exitCode: null,
        signal: null,
        timedOut,
        error: error.message,
        stdout: "",
        stderr: "",
        stdoutExcerpt: "",
        stderrExcerpt: "",
      });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        command,
        args,
        startedAt,
        exitCode,
        signal,
        timedOut,
        stdout: redact(stdout),
        stderr: redact(stderr),
        stdoutExcerpt: excerpt(stdout),
        stderrExcerpt: excerpt(stderr),
      });
    });
  });
}

const results = [];
await mkdir(OUTPUT_DIR, { recursive: true });

for (const [command, args] of commands) {
  const result = await runCommand(command, args);
  results.push(result);
  const status = result.timedOut
    ? "timeout"
    : result.exitCode === 0
      ? "ok"
      : `exit ${result.exitCode ?? result.signal ?? "error"}`;
  console.log(`${command} ${args.join(" ")} => ${status}`);
  if (result.stdoutExcerpt) {
    console.log(result.stdoutExcerpt.split("\n").slice(0, 8).join("\n"));
  }
  if (result.stderrExcerpt) {
    console.error(result.stderrExcerpt.split("\n").slice(0, 8).join("\n"));
  }
}

await writeFile(
  OUTPUT_FILE,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      timeoutMs: TIMEOUT_MS,
      outputDir: OUTPUT_DIR,
      results,
    },
    null,
    2,
  )}\n`,
);

console.log(`\nFull redacted results: ${OUTPUT_FILE}`);
