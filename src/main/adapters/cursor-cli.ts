/**
 * Active spawn adapter for Cursor — uses `cursor-agent --print --output-format
 * stream-json` to spawn a Cursor agent process and stream its tool calls and
 * assistant text back through the bus.
 *
 * Mirrors the structure of claude-cli.ts.
 */

import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { bus } from "../event-bus";
import type { AgentEvent } from "@shared/events";
import {
  parseProviderStreamMessage,
  type ProviderStreamMessage,
} from "@shared/schemas";

export type SpawnCursorOptions = {
  prompt: string;
  cwd: string;
};

export type SpawnedCursorAgent = {
  unitId: string;
  sessionId: string;
  cwd: string;
  proc: ChildProcess;
  send(prompt: string): void;
  kill(): void;
};

const agents = new Map<string, SpawnedCursorAgent>();

export function listCursorAgents(): SpawnedCursorAgent[] {
  return [...agents.values()];
}

export function getCursorAgent(unitId: string): SpawnedCursorAgent | undefined {
  return agents.get(unitId);
}

function buildArgs(prompt: string, chatId: string): string[] {
  // No --stream-partial-output: we want whole assistant messages, not
  // mid-token deltas. Deltas would render as a flood of fragmented bubbles.
  return [
    "--print",
    "--output-format",
    "stream-json",
    "--force",
    "--trust",
    "--resume",
    chatId,
    prompt,
  ];
}

function spawnCursorProcess(prompt: string, cwd: string, chatId: string) {
  return spawn("cursor-agent", buildArgs(prompt, chatId), {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
}

function createChat(cwd: string): string {
  const out = execFileSync("cursor-agent", ["create-chat"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
  return out.trim();
}

export function spawnCursorAgent(opts: SpawnCursorOptions): SpawnedCursorAgent {
  const sessionId = createChat(opts.cwd);
  const unitId = sessionId;
  const proc = spawnCursorProcess(opts.prompt, opts.cwd, sessionId);

  bus.emitAgentEvent({
    sessionId,
    tool: "cursor",
    cwd: opts.cwd,
    timestamp: Date.now(),
    kind: "session_start",
    payload: { text: opts.prompt },
    source: "spawned",
  });

  attachStream(
    proc,
    () => sessionId,
    () => {},
    opts.cwd
  );
  proc.on("exit", () => agents.delete(unitId));

  const agent: SpawnedCursorAgent = {
    unitId,
    sessionId,
    cwd: opts.cwd,
    proc,
    send(prompt: string) {
      bus.emitAgentEvent({
        sessionId,
        tool: "cursor",
        cwd: opts.cwd,
        timestamp: Date.now(),
        kind: "user_prompt",
        payload: { text: prompt },
        source: "spawned",
      });
      const followUp = spawnCursorProcess(prompt, opts.cwd, sessionId);
      attachStream(
        followUp,
        () => sessionId,
        () => {},
        opts.cwd
      );
    },
    kill() {
      proc.kill("SIGTERM");
    },
  };
  agents.set(unitId, agent);
  return agent;
}

function attachStream(
  proc: ChildProcess,
  getSessionId: () => string,
  setSessionId: (id: string) => void,
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
      const sid = msg.session_id ?? msg.sessionId;
      if (typeof sid === "string" && sid && getSessionId() !== sid) {
        setSessionId(sid);
      }
      const events = normalizeCursorStreamMessage(msg, getSessionId(), cwd);
      for (const ev of events) bus.emitAgentEvent(ev);
    }
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    // cursor-agent writes informational tracing/telemetry lines to stderr.
    // Skip those so they don't show up as errors in the chat.
    if (
      /cursor-retrieval: tracing/.test(text) ||
      /^\s*$/.test(text) ||
      /^\[?(info|debug|trace)\b/i.test(text.trim())
    ) {
      return;
    }
    bus.emitAgentEvent({
      sessionId: getSessionId(),
      tool: "cursor",
      cwd,
      timestamp: Date.now(),
      kind: "error",
      payload: { error: text },
      source: "spawned",
    });
  });
  proc.on("exit", (code) => {
    bus.emitAgentEvent({
      sessionId: getSessionId(),
      tool: "cursor",
      cwd,
      timestamp: Date.now(),
      kind: "session_end",
      payload: { text: `exit ${code ?? 0}` },
      source: "spawned",
    });
  });
}

export function normalizeCursorStreamMessage(
  msg: ProviderStreamMessage,
  sessionId: string,
  cwd: string
): AgentEvent[] {
  // cursor-agent emits a richer stream than claude. We surface only the things
  // that map cleanly to AgentEvent kinds; thinking deltas, tool_call started,
  // partial-output deltas, system init, and user echoes are ignored.
  const ts = Date.now();
  const base = {
    sessionId,
    tool: "cursor" as const,
    cwd,
    source: "spawned" as const,
  };
  const out: AgentEvent[] = [];

  // Drop anything labelled as a delta or partial; we only render whole messages.
  if (
    msg.subtype === "delta" ||
    msg.type === "thinking" ||
    msg.type === "system"
  ) {
    return out;
  }

  if (msg.type === "tool_call") {
    if (msg.subtype === "completed") {
      const tc =
        (msg as { tool_call?: Record<string, unknown> }).tool_call ?? {};
      const firstKey = Object.keys(tc)[0];
      const inner = (tc as Record<string, unknown>)[firstKey] as
        | Record<string, unknown>
        | undefined;
      const name = firstKey?.replace(/ToolCall$/, "") ?? "tool";
      out.push({
        ...base,
        timestamp: ts,
        kind: "tool_use",
        payload: { name, input: inner?.args },
      });
      out.push({
        ...base,
        timestamp: ts,
        kind: "tool_result",
        payload: { output: inner?.result },
      });
    }
    return out;
  }

  if (msg.type === "assistant") {
    const message = (msg as { message?: { content?: unknown } }).message;
    const content = message?.content;
    if (Array.isArray(content)) {
      for (const block of content as Record<string, unknown>[]) {
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
            payload: { name: String(block.name ?? ""), input: block.input },
          });
        }
      }
    }
  } else if (msg.type === "user") {
    const message = (msg as { message?: { content?: unknown } }).message;
    const content = message?.content;
    if (Array.isArray(content)) {
      for (const block of content as Record<string, unknown>[]) {
        if (block.type === "tool_result") {
          out.push({
            ...base,
            timestamp: ts,
            kind: "tool_result",
            payload: { output: block.content },
          });
        }
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
  } else if (msg.type === "error" || msg.is_error) {
    out.push({
      ...base,
      timestamp: ts,
      kind: "error",
      payload: {
        error: String(
          msg.message ?? msg.error ?? msg.result ?? "unknown error"
        ),
      },
    });
  }
  return out;
}
