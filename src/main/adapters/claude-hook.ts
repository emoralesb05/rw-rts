import { createServer, Server, Socket } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { bus } from "../event-bus";
import { isSpawnedSession } from "./claude-cli";
import type { AgentEvent, AgentEventKind } from "@shared/events";

export const SOCKET_PATH = join(homedir(), ".claude", "kh-rts.sock");

let server: Server | null = null;

export function startHookBridge() {
  if (server) return;
  if (existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH);
    } catch {
      // ignore
    }
  }
  server = createServer((socket: Socket) => {
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
    });
    const finalize = () => {
      if (buf.trim()) {
        try {
          const payload = JSON.parse(buf);
          const ev = normalizeHookPayload(payload);
          if (ev) bus.emitAgentEvent(ev);
        } catch {
          // ignore malformed
        }
      }
      socket.destroy();
    };
    socket.on("end", finalize);
    socket.on("error", () => socket.destroy());
  });
  server.listen(SOCKET_PATH, () => {
    // eslint-disable-next-line no-console
    console.log("[kh-rts] hook bridge listening on", SOCKET_PATH);
  });
}

export function stopHookBridge() {
  server?.close();
  server = null;
  if (existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH);
    } catch {
      // ignore
    }
  }
}

function normalizeHookPayload(p: any): AgentEvent | null {
  if (!p?.session_id) return null;
  if (isSpawnedSession(p.session_id)) return null;
  const ts = Date.now();
  const base = {
    sessionId: p.session_id as string,
    tool: "claude" as const,
    cwd: (p.cwd as string) ?? process.cwd(),
    source: "hook" as const,
  };
  const eventName = p.hook_event_name as string | undefined;

  const map: Record<string, AgentEventKind> = {
    PreToolUse: "tool_use",
    PostToolUse: "tool_result",
    UserPromptSubmit: "user_prompt",
    SessionStart: "session_start",
    SessionEnd: "session_end",
    Stop: "session_end",
    SubagentStop: "subagent_spawn",
  };
  const kind = eventName ? map[eventName] : undefined;
  if (!kind) return null;

  return {
    ...base,
    timestamp: ts,
    kind,
    payload: {
      name: p.tool_name,
      input: p.tool_input,
      output: p.tool_response,
      text: p.prompt ?? p.user_prompt,
    },
  };
}
