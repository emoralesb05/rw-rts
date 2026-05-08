/**
 * Gemini CLI active-spawn adapter.
 *
 * Gemini headless mode emits JSONL via:
 *   gemini --prompt "<text>" --output-format stream-json
 *
 * The first `init` event contains the generated session_id. Resume accepts
 * that UUID (`--resume <session_id>`), even though the help text emphasizes
 * numeric indexes and "latest".
 */
import { spawn, type ChildProcess } from "node:child_process";
import { bus } from "../event-bus";
import { registerSpawnedSession, unregisterSpawnedSession } from "./claude-cli";
import {
  GeminiInitMessageSchema,
  parseProviderStreamMessage,
} from "@shared/schemas";

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

function buildArgs(prompt: string, resumeId?: string): string[] {
  const args = [
    "--prompt",
    prompt,
    "--output-format",
    "stream-json",
    "--approval-mode",
    "yolo",
  ];
  if (resumeId) args.push("--resume", resumeId);
  return args;
}

function spawnGeminiProcess(prompt: string, cwd: string, resumeId?: string) {
  return spawn("gemini", buildArgs(prompt, resumeId), {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, KEYKEEPER_GEMINI_FAIL_CLOSED: "1" },
  });
}

export async function spawnGeminiAgent(
  opts: SpawnGeminiOptions
): Promise<SpawnedGeminiAgent> {
  const proc = spawnGeminiProcess(opts.prompt, opts.cwd);
  let sessionId: string;
  try {
    sessionId = await waitForSessionId(proc, 15000);
  } catch (err) {
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    throw err;
  }

  registerSpawnedSession(sessionId);

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
      const followUp = spawnGeminiProcess(prompt, opts.cwd, sessionId);
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

function waitForSessionId(
  proc: ChildProcess,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      proc.stdout?.off("data", onData);
      proc.off("exit", onExit);
      proc.off("error", onError);
    };
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const timer = setTimeout(() => {
      settle(() => reject(new Error("gemini did not emit init in time")));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = parseProviderStreamMessage(line);
        if (msg) {
          const init = GeminiInitMessageSchema.safeParse(msg);
          if (init.success) {
            const remaining = buf;
            settle(() => {
              if (remaining) {
                setImmediate(() =>
                  proc.stdout?.emit("data", Buffer.from(remaining))
                );
              }
              resolve(init.data.session_id);
            });
            return;
          }
        }
      }
    };
    const onExit = () => {
      settle(() => reject(new Error("gemini exited before emitting init")));
    };
    const onError = (err: Error) => {
      settle(() => reject(err));
    };
    proc.stdout?.on("data", onData);
    proc.once("exit", onExit);
    proc.once("error", onError);
  });
}

function attachStream(proc: ChildProcess, sessionId: string, cwd: string) {
  let buf = "";
  let assistantBuffer = "";
  let sawResult = false;
  const toolNameById = new Map<string, string | undefined>();
  const base = {
    sessionId,
    tool: "gemini" as const,
    cwd,
    source: "spawned" as const,
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
