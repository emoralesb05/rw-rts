/**
 * Codex CLI active-spawn adapter.
 *
 * Codex emits JSONL via `codex exec --json`:
 *   {"type":"thread.started","thread_id":"..."}
 *   {"type":"turn.started"}
 *   {"type":"item.completed","item":{"id":"...","type":"agent_message","text":"..."}}
 *   {"type":"item.completed","item":{"type":"reasoning",...}}  (skipped)
 *   {"type":"item.completed","item":{"type":"command_execution",...}}
 *   {"type":"item.completed","item":{"type":"file_change",...}}
 *   {"type":"turn.completed","usage":{...}}
 *
 * thread_id is the session id; we await it before returning the agent so the
 * renderer's unit registers under the real id from the start (no late-binding
 * mismatch).
 *
 * For follow-up `send`, we spawn `codex exec resume <thread_id> "<prompt>"`.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { bus } from "../event-bus";
import {
  registerSpawnedSession,
  unregisterSpawnedSession,
} from "./claude-cli";
import type { AgentEvent } from "@shared/events";
import {
  CodexThreadStartedSchema,
  parseProviderStreamMessage,
  type ProviderStreamMessage,
} from "@shared/schemas";

export type SpawnCodexOptions = {
  prompt: string;
  cwd: string;
};

export type SpawnedCodexAgent = {
  unitId: string;
  sessionId: string;
  cwd: string;
  proc: ChildProcess;
  send(prompt: string): void;
  kill(): void;
};

const agents = new Map<string, SpawnedCodexAgent>();

export function listCodexAgents(): SpawnedCodexAgent[] {
  return [...agents.values()];
}

export function getCodexAgent(unitId: string): SpawnedCodexAgent | undefined {
  return agents.get(unitId);
}

function buildArgs(prompt: string, resumeId?: string): string[] {
  const args: string[] = ["exec", "--json", "--skip-git-repo-check", "--full-auto"];
  if (resumeId) args.unshift(...[]); // `exec resume` is a subcommand
  if (resumeId) {
    return ["exec", "resume", resumeId, "--json", "--skip-git-repo-check", "--full-auto", prompt];
  }
  args.push(prompt);
  return args;
}

function spawnCodexProcess(prompt: string, cwd: string, resumeId?: string) {
  return spawn("codex", buildArgs(prompt, resumeId), {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
}

export async function spawnCodexAgent(opts: SpawnCodexOptions): Promise<SpawnedCodexAgent> {
  const proc = spawnCodexProcess(opts.prompt, opts.cwd);
  let sessionId: string;
  try {
    sessionId = await waitForThreadId(proc, 15000);
  } catch (err) {
    // P2 #1: ensure the orphaned process is killed if thread.started
    // never arrives (broken binary, changed protocol, or true timeout).
    // Without this, the codex child keeps running outside AgentManager.
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ignore — already dead */
    }
    throw err;
  }

  // P1 #2: register before emitting session_start so the hook bridge's
  // isSpawnedSession filter starts dropping hook duplicates immediately.
  // Codex hooks are installed globally; the same conversation would
  // otherwise emit through both the spawn stdout stream and the hook
  // bridge, double-counting tool calls and letters.
  registerSpawnedSession(sessionId);

  bus.emitAgentEvent({
    sessionId,
    tool: "codex",
    cwd: opts.cwd,
    timestamp: Date.now(),
    kind: "session_start",
    payload: { text: opts.prompt },
    source: "spawned",
  });

  attachStream(proc, sessionId, opts.cwd);
  proc.on("exit", () => {
    agents.delete(sessionId);
    unregisterSpawnedSession(sessionId);
  });

  const agent: SpawnedCodexAgent = {
    unitId: sessionId,
    sessionId,
    cwd: opts.cwd,
    proc,
    send(prompt: string) {
      bus.emitAgentEvent({
        sessionId,
        tool: "codex",
        cwd: opts.cwd,
        timestamp: Date.now(),
        kind: "user_prompt",
        payload: { text: prompt },
        source: "spawned",
      });
      const followUp = spawnCodexProcess(prompt, opts.cwd, sessionId);
      attachStream(followUp, sessionId, opts.cwd);
    },
    kill() {
      proc.kill("SIGTERM");
    },
  };
  agents.set(sessionId, agent);
  return agent;
}

function waitForThreadId(proc: ChildProcess, timeoutMs: number): Promise<string> {
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
      settle(() => reject(new Error("codex exec did not emit thread.started in time")));
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
          const started = CodexThreadStartedSchema.safeParse(msg);
          if (started.success) {
            const remaining = buf;
            settle(() => {
              // Re-feed any remaining buffered data through the regular
              // stream handler so we don't lose later events.
              if (remaining) {
                setImmediate(() =>
                  proc.stdout?.emit("data", Buffer.from(remaining))
                );
              }
              resolve(started.data.thread_id);
            });
            return;
          }
        }
      }
    };
    const onExit = () => {
      settle(() => reject(new Error("codex exec exited before emitting thread.started")));
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
  proc.stdout?.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = parseProviderStreamMessage(line);
      if (!msg) continue;
      const events = normalizeCodexStreamMessage(msg, sessionId, cwd);
      for (const ev of events) bus.emitAgentEvent(ev);
    }
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    if (/^\s*$/.test(text) || /failed to record rollout items/.test(text)) return;
    bus.emitAgentEvent({
      sessionId,
      tool: "codex",
      cwd,
      timestamp: Date.now(),
      kind: "error",
      payload: { error: text },
      source: "spawned",
    });
  });
  proc.on("exit", (code) => {
    bus.emitAgentEvent({
      sessionId,
      tool: "codex",
      cwd,
      timestamp: Date.now(),
      kind: "session_end",
      payload: { text: `exit ${code ?? 0}` },
      source: "spawned",
    });
  });
}

export function normalizeCodexStreamMessage(
  msg: ProviderStreamMessage,
  sessionId: string,
  cwd: string
): AgentEvent[] {
  const ts = Date.now();
  const base = { sessionId, tool: "codex" as const, cwd, source: "spawned" as const };
  const out: AgentEvent[] = [];

  if (msg.type === "item.completed") {
    const item = (msg as { item?: Record<string, unknown> }).item ?? {};
    const itemType = String(item.type ?? "");
    if (itemType === "agent_message" && typeof item.text === "string") {
      out.push({ ...base, timestamp: ts, kind: "assistant_text", payload: { text: item.text } });
    } else if (itemType === "command_execution") {
      const cmd = String(item.command ?? "");
      const result = item.aggregated_output ?? item.output ?? item.exit_code;
      out.push({
        ...base,
        timestamp: ts,
        kind: "tool_use",
        payload: { name: "Bash", input: { command: cmd } },
      });
      if (result !== undefined) {
        out.push({
          ...base,
          timestamp: ts + 1,
          kind: "tool_result",
          payload: { output: result },
        });
      }
    } else if (itemType === "file_change") {
      const path = String(item.path ?? item.file_path ?? "");
      out.push({
        ...base,
        timestamp: ts,
        kind: "tool_use",
        payload: { name: "Edit", input: { file_path: path, change: item.change } },
      });
    }
    // 'reasoning' items skipped — they're verbose and not user-facing
  }
  return out;
}
