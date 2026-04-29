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
 * Pending PermissionRequest entries, keyed by the request_id the Python
 * hook tagged the payload with. We hold the open socket here until the
 * renderer comes back with allow/deny via IPC, then write the reply
 * and close. There is no safety timer — the user explicitly chose to
 * wait indefinitely rather than risk a stale auto-dismiss before they
 * decided. If the socket errors (e.g. Python died, connection reset),
 * the error handler emits permission_resolved("error") so the renderer
 * can drop the now-unanswerable letter.
 */
type Pending = {
  socket: Socket;
  // Identity captured at receive time, used to emit a synthetic
  // permission_resolved event when the socket errors (which is now
  // the only reason a pending entry concludes outside the GUI — the
  // safety timer was removed because the user wanted permission
  // letters to wait indefinitely until decided).
  sessionId: string;
  cwd: string;
};
const pending = new Map<string, Pending>();

function emitPermissionResolved(
  ctx: { sessionId: string; cwd: string },
  requestId: string,
  resolution: "error"
) {
  bus.emitAgentEvent({
    sessionId: ctx.sessionId,
    tool: "claude",
    cwd: ctx.cwd,
    source: "hook",
    timestamp: Date.now(),
    kind: "permission_resolved",
    payload: { requestId, resolution },
  });
}

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
        // No timer — the entry stays open until the GUI resolves it,
        // the socket errors, or the bridge shuts down (e.g. main exit).
        // Python's recv() blocks the same way; if the GUI dies, socket
        // tear-down will surface as recv EOF on its end.
        pending.set(id, { socket, sessionId: ev.sessionId, cwd: ev.cwd });
      } else {
        socket.destroy();
      }
    };
    socket.on("end", finalize);
    socket.on("error", () => {
      // If a pending socket errors, drop it and tell the renderer so
      // the orphaned letter gets dismissed (no way to reply now).
      for (const [id, p] of pending) {
        if (p.socket === socket) {
          pending.delete(id);
          emitPermissionResolved(
            { sessionId: p.sessionId, cwd: p.cwd },
            id,
            "error"
          );
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
 * IPC.ResolvePermission handler. Returns false if no pending entry
 * exists, which the renderer treats as "already resolved elsewhere"
 * and uses to dismiss the now-stale letter.
 */
export function resolvePermissionRequest(
  requestId: string,
  decision: PermissionDecision,
  message?: string
): boolean {
  const p = pending.get(requestId);
  if (!p) return false;
  pending.delete(requestId);
  try {
    // denyMessage is read by bin/kh-rts-hook and only emitted to Claude
    // when behavior=deny — upstream PermissionRequest contract has no
    // message field for allow.
    const reply = JSON.stringify({
      permissionDecision: decision,
      denyMessage: decision === "deny" ? (message ?? undefined) : undefined,
    });
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
