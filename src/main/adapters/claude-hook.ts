import { createServer, Server, Socket } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { bus } from "../event-bus";
import { isSpawnedSession } from "./claude-cli";
import type { AgentEvent, AgentEventKind } from "@shared/events";
import type { PermissionDecision } from "@shared/ipc";

export const SOCKET_PATH = join(homedir(), ".claude", "kh-rts.sock");

let server: Server | null = null;

/**
 * Pending PreToolUse permission requests, keyed by the request_id the
 * Python hook tagged the payload with. We hold the open socket here
 * until the renderer comes back with allow/deny via IPC, then write
 * the reply and close.
 *
 * Auto-cleared on a 60s safety timer so a closed renderer doesn't leak
 * sockets — Python side has its own 60s timeout, so when our timer fires
 * the script will already have given up.
 */
type Pending = {
  socket: Socket;
  timer: NodeJS.Timeout;
};
const pending = new Map<string, Pending>();
const PENDING_TIMEOUT_MS = 65_000;

export function startHookBridge() {
  if (server) return;
  if (existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH);
    } catch {
      // ignore
    }
  }
  // allowHalfOpen lets us keep the write side of the socket open after
  // the client sends FIN (Python's shutdown(SHUT_WR)). Required for the
  // bidirectional permission flow — without this, Node auto-closes the
  // socket on "end" and resolvePermissionRequest has nothing to write to.
  server = createServer({ allowHalfOpen: true }, (socket: Socket) => {
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
    });
    const finalize = () => {
      if (!buf.trim()) {
        socket.destroy();
        return;
      }
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(buf);
      } catch {
        socket.destroy();
        return;
      }
      const ev = normalizeHookPayload(payload);
      if (!ev) {
        socket.destroy();
        return;
      }
      bus.emitAgentEvent(ev);
      // permission_request needs the socket kept open until the renderer
      // resolves it. All other events are fire-and-forget.
      if (ev.kind === "permission_request" && ev.payload.requestId) {
        const id = ev.payload.requestId;
        const timer = setTimeout(() => {
          // Hard timeout: close the socket without writing — Python
          // will read EOF and fall back to silent exit (no decision).
          const p = pending.get(id);
          if (!p) return;
          pending.delete(id);
          try {
            p.socket.end();
          } catch {
            /* ignore */
          }
        }, PENDING_TIMEOUT_MS);
        pending.set(id, { socket, timer });
      } else {
        socket.destroy();
      }
    };
    socket.on("end", finalize);
    socket.on("error", () => {
      // If a pending socket errors, drop it.
      for (const [id, p] of pending) {
        if (p.socket === socket) {
          clearTimeout(p.timer);
          pending.delete(id);
        }
      }
      socket.destroy();
    });
  });
  server.listen(SOCKET_PATH, () => {
    // eslint-disable-next-line no-console
    console.log("[kh-rts] hook bridge listening on", SOCKET_PATH);
  });
}

export function stopHookBridge() {
  // Resolve any pending requests with a silent close so Python isn't
  // stuck waiting for us across a restart.
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    try {
      p.socket.end();
    } catch {
      /* ignore */
    }
  }
  pending.clear();
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

/**
 * Resolve a pending permission request — write the JSON reply on the
 * still-open hook socket and close it. Called by main from the
 * IPC.ResolvePermission handler.
 */
export function resolvePermissionRequest(
  requestId: string,
  decision: PermissionDecision
): boolean {
  const p = pending.get(requestId);
  if (!p) return false;
  pending.delete(requestId);
  clearTimeout(p.timer);
  try {
    const reply = JSON.stringify({ permissionDecision: decision });
    p.socket.end(reply);
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Read-only inspector for diagnostics / tests.
 */
export function pendingPermissionCount(): number {
  return pending.size;
}

function normalizeHookPayload(p: any): AgentEvent | null {
  if (!p?.session_id) return null;
  const ts = Date.now();
  const base = {
    sessionId: p.session_id as string,
    tool: "claude" as const,
    cwd: (p.cwd as string) ?? process.cwd(),
    source: "hook" as const,
  };
  const eventName = p.hook_event_name as string | undefined;
  const requestId = p.__kh_permission_request_id as string | undefined;

  // PermissionRequest with a request_id means the Python script wants a
  // permission decision back. Emit as permission_request, not tool_use.
  // Permission requests bypass the spawned-session filter — keykeeper
  // wants to gate spawned sessions too. (PreToolUse + request_id is
  // also accepted for back-compat with any in-flight scripts.)
  if (
    (eventName === "PermissionRequest" || eventName === "PreToolUse") &&
    requestId
  ) {
    return {
      ...base,
      timestamp: ts,
      kind: "permission_request",
      payload: {
        name: p.tool_name,
        input: p.tool_input,
        requestId,
      },
    };
  }

  // For non-permission events, skip sessions we spawned ourselves —
  // those events come through the spawn channel directly with richer
  // payloads. Hook duplicates would double-emit.
  if (isSpawnedSession(p.session_id)) return null;

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
