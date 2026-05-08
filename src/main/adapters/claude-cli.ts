import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { bus } from "../event-bus";
import type { AgentEvent } from "@shared/events";
import {
  parseProviderStreamMessage,
  type ProviderStreamMessage,
} from "@shared/schemas";

export type SpawnOptions = {
  prompt: string;
  cwd: string;
};

export type SpawnedAgent = {
  unitId: string;
  sessionId: string;
  cwd: string;
  proc: ChildProcess;
  send(prompt: string): void;
  kill(): void;
};

const agents = new Map<string, SpawnedAgent>();
const spawnedSessionIds = new Set<string>();

export function isSpawnedSession(sessionId: string): boolean {
  return spawnedSessionIds.has(sessionId);
}

// Cross-tool registry: hook bridge consults isSpawnedSession to drop
// hook events for sessions we already spawn (and emit events for
// directly via stdout). Codex spawn (codex-cli.ts) registers its
// thread_id here once thread.started arrives so the hook bridge
// suppresses the duplicate hook stream for the same session.
export function registerSpawnedSession(sessionId: string) {
  spawnedSessionIds.add(sessionId);
}

export function unregisterSpawnedSession(sessionId: string) {
  spawnedSessionIds.delete(sessionId);
}

function attachStdoutStream(
  proc: ChildProcess,
  sessionId: string,
  cwd: string
) {
  let buf = "";
  proc.stdout?.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = parseProviderStreamMessage(line);
      if (!msg) continue;
      const events = normalizeStreamMessage(msg, sessionId, cwd);
      for (const ev of events) bus.emitAgentEvent(ev);
    }
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    bus.emitAgentEvent({
      sessionId,
      tool: "claude",
      cwd,
      timestamp: Date.now(),
      kind: "error",
      payload: { error: chunk.toString("utf8") },
      source: "spawned",
    });
  });
  proc.on("exit", (code) => {
    bus.emitAgentEvent({
      sessionId,
      tool: "claude",
      cwd,
      timestamp: Date.now(),
      kind: "session_end",
      payload: { text: `exit ${code ?? 0}` },
      source: "spawned",
    });
  });
}

function spawnOneShot(
  prompt: string,
  sessionId: string,
  cwd: string,
  resume: boolean
) {
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
  if (resume) args.push("--resume", sessionId);
  else args.push("--session-id", sessionId);
  return spawn("claude", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
}

export function spawnClaudeAgent(opts: SpawnOptions): SpawnedAgent {
  const sessionId = randomUUID();
  const unitId = sessionId;
  spawnedSessionIds.add(sessionId);

  const proc = spawnOneShot(opts.prompt, sessionId, opts.cwd, false);

  attachStdoutStream(proc, sessionId, opts.cwd);
  proc.on("exit", () => {
    agents.delete(unitId);
    spawnedSessionIds.delete(sessionId);
  });

  bus.emitAgentEvent({
    sessionId,
    tool: "claude",
    cwd: opts.cwd,
    timestamp: Date.now(),
    kind: "session_start",
    payload: { text: opts.prompt },
    source: "spawned",
  });

  const agent: SpawnedAgent = {
    unitId,
    sessionId,
    cwd: opts.cwd,
    proc,
    send(prompt: string) {
      bus.emitAgentEvent({
        sessionId,
        tool: "claude",
        cwd: opts.cwd,
        timestamp: Date.now(),
        kind: "user_prompt",
        payload: { text: prompt },
        source: "spawned",
      });
      const followUp = spawnOneShot(prompt, sessionId, opts.cwd, true);
      attachStdoutStream(followUp, sessionId, opts.cwd);
    },
    kill() {
      proc.kill("SIGTERM");
    },
  };

  agents.set(unitId, agent);
  return agent;
}

export function getAgent(unitId: string): SpawnedAgent | undefined {
  return agents.get(unitId);
}

export function listAgents(): SpawnedAgent[] {
  return [...agents.values()];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function messageContentBlocks(
  msg: ProviderStreamMessage
): Record<string, unknown>[] {
  const message = record(msg.message);
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    const r = record(block);
    return r ? [r] : [];
  });
}

export function normalizeStreamMessage(
  msg: ProviderStreamMessage,
  sessionId: string,
  cwd: string
): AgentEvent[] {
  const base = {
    sessionId,
    tool: "claude" as const,
    cwd,
    source: "spawned" as const,
  };
  const ts = Date.now();
  const out: AgentEvent[] = [];

  if (msg.type === "assistant") {
    for (const block of messageContentBlocks(msg)) {
      if (block.type === "text" && typeof block.text === "string") {
        out.push({
          ...base,
          timestamp: ts,
          kind: "assistant_text",
          payload: { text: block.text },
        });
      } else if (block.type === "tool_use") {
        out.push({
          ...base,
          timestamp: ts,
          kind: "tool_use",
          payload: {
            name: typeof block.name === "string" ? block.name : undefined,
            input: block.input,
          },
        });
      }
    }
  } else if (msg.type === "user") {
    for (const block of messageContentBlocks(msg)) {
      if (block.type === "tool_result") {
        out.push({
          ...base,
          timestamp: ts,
          kind: "tool_result",
          payload: { output: block.content },
        });
      }
    }
  } else if (msg.type === "result") {
    out.push({
      ...base,
      timestamp: ts,
      kind: "session_end",
      payload: {
        text: typeof msg.result === "string" ? msg.result : "",
        output: msg.usage,
      },
    });
  }
  return out;
}
