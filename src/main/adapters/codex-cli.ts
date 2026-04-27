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
import type { AgentEvent } from "@shared/events";

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
  const sessionId = await waitForThreadId(proc, 15000);

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
  proc.on("exit", () => agents.delete(sessionId));

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
    const timer = setTimeout(() => {
      proc.stdout?.off("data", onData);
      reject(new Error("codex exec did not emit thread.started in time"));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "thread.started" && typeof msg.thread_id === "string") {
            clearTimeout(timer);
            proc.stdout?.off("data", onData);
            // Re-feed any remaining buffered data through the regular stream
            // handler so we don't lose later events.
            if (buf) {
              setImmediate(() => proc.stdout?.emit("data", Buffer.from(buf)));
            }
            resolve(msg.thread_id);
            return;
          }
        } catch {
          // ignore
        }
      }
    };
    proc.stdout?.on("data", onData);
    proc.on("exit", () => {
      clearTimeout(timer);
      reject(new Error("codex exec exited before emitting thread.started"));
    });
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
      try {
        const msg = JSON.parse(line);
        const events = normalize(msg, sessionId, cwd);
        for (const ev of events) bus.emitAgentEvent(ev);
      } catch {
        // ignore non-JSON lines
      }
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

function normalize(
  msg: Record<string, unknown>,
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
