/**
 * Gemini CLI active-spawn adapter.
 *
 * Gemini headless mode emits JSONL via:
 *   gemini --prompt "<text>" --output-format stream-json
 *
 * Realmkeeper starts new sessions with an explicit UUID via `--session-id`.
 * Resume accepts that UUID (`--resume <session_id>`), even though the help
 * text emphasizes numeric indexes and "latest".
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { bus } from "../event-bus";
import { registerSpawnedSession, unregisterSpawnedSession } from "./claude-cli";
import { parseProviderStreamMessage } from "@shared/schemas";
import type { AgentEventSource } from "@shared/events";

export type SpawnGeminiOptions = {
  prompt: string;
  cwd: string;
};

export type SpawnedGeminiAgent = {
  unitId: string;
  sessionId: string;
  cwd: string;
  proc: ChildProcess;
  send(prompt: string): void;
  kill(): void;
};

const agents = new Map<string, SpawnedGeminiAgent>();

const GEMINI_TOOL_NAME_CANONICAL: Record<string, string> = {
  run_shell_command: "Bash",
  read_file: "Read",
  read_many_files: "Read",
  list_directory: "Glob",
  glob: "Glob",
  grep_search: "Grep",
  search_file_content: "Grep",
  write_file: "Write",
  replace: "Edit",
  write_todos: "TodoWrite",
  google_web_search: "WebSearch",
  web_fetch: "WebFetch",
};

const GEMINI_SETTINGS_PATH = join(homedir(), ".gemini", "settings.json");
const GEMINI_MANAGED_POLICY_PATH = join(
  dirname(GEMINI_SETTINGS_PATH),
  "policies",
  "realmkeeper-managed.toml"
);

export type GeminiApprovalMode = "default" | "auto_edit" | "yolo" | "plan";

export type BuildGeminiArgsOptions = {
  resumeId?: string;
  sessionId?: string;
  approvalMode?: GeminiApprovalMode;
  policyPaths?: string[];
  adminPolicyPaths?: string[];
  includeDirectories?: string[];
  sandbox?: boolean;
  skipTrust?: boolean;
  model?: string;
};

export function listGeminiAgents(): SpawnedGeminiAgent[] {
  return [...agents.values()];
}

export function getGeminiAgent(unitId: string): SpawnedGeminiAgent | undefined {
  return agents.get(unitId);
}

function canonicalToolName(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  return GEMINI_TOOL_NAME_CANONICAL[raw] ?? raw;
}

function errorMessage(raw: unknown, fallback: string): string {
  if (raw && typeof raw === "object" && "message" in raw) {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(raw ?? fallback);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function buildGeminiArgs(
  prompt: string,
  opts: BuildGeminiArgsOptions = {}
): string[] {
  const args = [
    "--prompt",
    prompt,
    "--output-format",
    "stream-json",
    "--approval-mode",
    opts.approvalMode ?? "yolo",
  ];
  if (opts.skipTrust) args.push("--skip-trust");
  if (opts.model) args.push("--model", opts.model);
  if (opts.sandbox !== undefined) args.push("--sandbox", String(opts.sandbox));
  for (const path of opts.policyPaths ?? []) args.push("--policy", path);
  for (const path of opts.adminPolicyPaths ?? [])
    args.push("--admin-policy", path);
  for (const path of opts.includeDirectories ?? [])
    args.push("--include-directories", path);
  if (opts.resumeId) args.push("--resume", opts.resumeId);
  else if (opts.sessionId) args.push("--session-id", opts.sessionId);
  return args;
}

export function buildGeminiLaunchOptions(
  realmkeeperGateInstalled: boolean
): Pick<BuildGeminiArgsOptions, "approvalMode" | "skipTrust"> {
  return {
    approvalMode: realmkeeperGateInstalled ? "yolo" : "default",
    skipTrust: true,
  };
}

export function isRealmkeeperGeminiGateInstalled(): boolean {
  try {
    const settings = JSON.parse(readFileSync(GEMINI_SETTINGS_PATH, "utf8")) as {
      hooks?: Record<string, unknown>;
      hooksConfig?: Record<string, unknown>;
    };
    if (settings.hooksConfig?.enabled === false) return false;
    const beforeTool = settings.hooks?.BeforeTool;
    const beforeToolEntries = Array.isArray(beforeTool) ? beforeTool : [];
    const hasFailClosedHook = beforeToolEntries.some((entry) => {
      const hooks = record(entry)?.hooks;
      if (!Array.isArray(hooks)) return false;
      return hooks.some((hook) => {
        const command = record(hook)?.command;
        return (
          typeof command === "string" &&
          command.includes("realmkeeper-managed") &&
          command.includes("REALMKEEPER_GEMINI_FAIL_CLOSED=1")
        );
      });
    });
    if (!hasFailClosedHook || !existsSync(GEMINI_MANAGED_POLICY_PATH)) {
      return false;
    }
    return readFileSync(GEMINI_MANAGED_POLICY_PATH, "utf8").includes(
      "realmkeeper-managed"
    );
  } catch {
    return false;
  }
}

function spawnGeminiProcess(
  prompt: string,
  cwd: string,
  opts: Pick<BuildGeminiArgsOptions, "resumeId" | "sessionId"> = {}
) {
  const launchOptions = buildGeminiLaunchOptions(
    isRealmkeeperGeminiGateInstalled()
  );
  return spawn(
    "gemini",
    buildGeminiArgs(prompt, { ...launchOptions, ...opts }),
    {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, REALMKEEPER_GEMINI_FAIL_CLOSED: "1" },
    }
  );
}

export function resumeGeminiSession(opts: {
  sessionId: string;
  cwd: string;
  prompt: string;
}): ChildProcess {
  registerSpawnedSession(opts.sessionId);
  bus.emitAgentEvent({
    sessionId: opts.sessionId,
    tool: "gemini",
    cwd: opts.cwd,
    timestamp: Date.now(),
    kind: "user_prompt",
    payload: { text: opts.prompt },
    source: "realmkeeper",
  });
  const proc = spawnGeminiProcess(opts.prompt, opts.cwd, {
    resumeId: opts.sessionId,
  });
  attachStream(proc, opts.sessionId, opts.cwd, "realmkeeper");
  proc.on("exit", () => unregisterSpawnedSession(opts.sessionId));
  proc.on("error", () => unregisterSpawnedSession(opts.sessionId));
  return proc;
}

export async function spawnGeminiAgent(
  opts: SpawnGeminiOptions
): Promise<SpawnedGeminiAgent> {
  const sessionId = randomUUID();
  registerSpawnedSession(sessionId);
  const proc = spawnGeminiProcess(opts.prompt, opts.cwd, { sessionId });

  bus.emitAgentEvent({
    sessionId,
    tool: "gemini",
    cwd: opts.cwd,
    timestamp: Date.now(),
    kind: "session_start",
    payload: { text: opts.prompt },
    source: "spawned",
  });

  const agent: SpawnedGeminiAgent = {
    unitId: sessionId,
    sessionId,
    cwd: opts.cwd,
    proc,
    send(prompt: string) {
      bus.emitAgentEvent({
        sessionId,
        tool: "gemini",
        cwd: opts.cwd,
        timestamp: Date.now(),
        kind: "user_prompt",
        payload: { text: prompt },
        source: "spawned",
      });
      const followUp = spawnGeminiProcess(prompt, opts.cwd, {
        resumeId: sessionId,
      });
      agent.proc = followUp;
      attachStream(followUp, sessionId, opts.cwd);
    },
    kill() {
      unregisterSpawnedSession(sessionId);
      agent.proc.kill("SIGTERM");
      agents.delete(sessionId);
    },
  };
  agents.set(sessionId, agent);

  attachStream(proc, sessionId, opts.cwd);
  return agent;
}

function attachStream(
  proc: ChildProcess,
  sessionId: string,
  cwd: string,
  source: AgentEventSource = "spawned"
) {
  let buf = "";
  let assistantBuffer = "";
  let sawResult = false;
  const toolNameById = new Map<string, string | undefined>();
  const base = {
    sessionId,
    tool: "gemini" as const,
    cwd,
    source,
  };

  const flushAssistant = () => {
    const text = assistantBuffer.trim();
    assistantBuffer = "";
    if (!text) return;
    bus.emitAgentEvent({
      ...base,
      timestamp: Date.now(),
      kind: "assistant_text",
      payload: { text },
    });
  };

  proc.stdout?.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = parseProviderStreamMessage(line);
      if (!msg) continue;
      try {
        const ts = Date.now();
        switch (msg.type) {
          case "message":
            if (msg.role === "assistant" && typeof msg.content === "string") {
              if (msg.delta) assistantBuffer += msg.content;
              else {
                flushAssistant();
                bus.emitAgentEvent({
                  ...base,
                  timestamp: ts,
                  kind: "assistant_text",
                  payload: { text: msg.content },
                });
              }
            }
            break;
          case "tool_use": {
            flushAssistant();
            const name = canonicalToolName(msg.tool_name);
            if (typeof msg.tool_id === "string")
              toolNameById.set(msg.tool_id, name);
            bus.emitAgentEvent({
              ...base,
              timestamp: ts,
              kind: "tool_use",
              payload: { name, input: msg.parameters },
            });
            break;
          }
          case "tool_result": {
            flushAssistant();
            const name =
              typeof msg.tool_id === "string"
                ? toolNameById.get(msg.tool_id)
                : undefined;
            bus.emitAgentEvent({
              ...base,
              timestamp: ts,
              kind: "tool_result",
              payload: {
                name,
                output: msg.output ?? msg.error,
              },
            });
            if (msg.status === "error" || msg.error) {
              bus.emitAgentEvent({
                ...base,
                timestamp: ts + 1,
                kind: "error",
                payload: {
                  error: errorMessage(msg.error, "tool error"),
                },
              });
            }
            break;
          }
          case "error":
            flushAssistant();
            bus.emitAgentEvent({
              ...base,
              timestamp: ts,
              kind: "error",
              payload: {
                error: String(msg.message ?? msg.error ?? "unknown error"),
              },
            });
            break;
          case "result":
            sawResult = true;
            flushAssistant();
            bus.emitAgentEvent({
              ...base,
              timestamp: ts,
              kind: "session_end",
              payload: { text: String(msg.status ?? ""), output: msg.stats },
            });
            break;
        }
      } catch {
        // ignore malformed provider-specific shapes
      }
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    if (/^\s*$/.test(text) || /^\[?(info|debug|trace)\b/i.test(text.trim())) {
      return;
    }
    bus.emitAgentEvent({
      ...base,
      timestamp: Date.now(),
      kind: "error",
      payload: { error: text },
    });
  });

  proc.on("exit", (code) => {
    flushAssistant();
    if (sawResult) return;
    bus.emitAgentEvent({
      ...base,
      timestamp: Date.now(),
      kind: "session_end",
      payload: { text: `exit ${code ?? 0}` },
    });
  });
}
