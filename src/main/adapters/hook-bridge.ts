import { createServer } from "node:net";
import type { Server, Socket } from "node:net";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { bus } from "../event-bus";
import type { AgentTool } from "@shared/events";
import {
  HookPayloadSchema,
  type HookPayload,
  type PermissionDecision,
  type PermissionOption,
} from "@shared/schemas";
import { permissionOptionsForPayload } from "@shared/provider-permissions";
import { createHookDedupe } from "./hook-dedupe";
import { normalizeHookPayload } from "./hook-normalizer";

export const SOCKET_PATH = join(homedir(), ".keykeeper", "keykeeper.sock");

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
 *
 * `tool` is captured so error-path events get the right tool stamp;
 * the Python script handles output-shape translation, so the bridge's
 * reply payload is the same generic shape for all providers with a
 * bidirectional permission path.
 */
type Pending = {
  socket: Socket;
  sessionId: string;
  cwd: string;
  tool: AgentTool;
  options: PermissionOption[];
};
const pending = new Map<string, Pending>();
const hookDedupe = createHookDedupe();

function emitPermissionResolved(
  ctx: { sessionId: string; cwd: string; tool: AgentTool },
  requestId: string,
  resolution: "error"
) {
  bus.emitAgentEvent({
    sessionId: ctx.sessionId,
    tool: ctx.tool,
    cwd: ctx.cwd,
    source: "hook",
    timestamp: Date.now(),
    kind: "permission_resolved",
    payload: { requestId, resolution },
  });
}

/**
 * Both Cursor and Claude empirically fire some hooks twice per logical
 * event (validate-then-execute pass, or similar). Examples:
 *   Cursor: beforeSubmitPrompt, preToolUse, postToolUse, stop
 *   Claude: UserPromptSubmit (sometimes)
 *
 * Single-entry installs verified, no other forwarders found — the
 * doubling originates upstream and we can't suppress it there. So
 * dedupe at the bridge: drop the second fire of an identical event
 * within DEDUPE_TTL_MS.
 *
 * Permission-request events are exempt — they each carry a unique
 * request_id and need their socket kept open for the renderer reply.
 *
 * Key construction:
 *   - tool_use_id when present (Cursor preToolUse/postToolUse + Claude
 *     PreToolUse/PostToolUse share this across pre/post, so combining
 *     with eventName disambiguates)
 *   - otherwise hash of meaningful payload fields
 */
export function startHookBridge() {
  if (server) return;
  // Ensure ~/.keykeeper/ exists before binding the socket inside it.
  try {
    mkdirSync(dirname(SOCKET_PATH), { recursive: true });
  } catch {
    // ignore
  }
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
      let payload: HookPayload;
      try {
        const parsed = HookPayloadSchema.safeParse(JSON.parse(buf));
        if (!parsed.success) {
          socket.destroy();
          return;
        }
        payload = parsed.data;
      } catch {
        socket.destroy();
        return;
      }
      const eventName = payload.hook_event_name;
      const sid =
        (payload?.session_id as string) ??
        (payload?.conversation_id as string) ??
        "?";
      const ev = normalizeHookPayload(payload);
      // Dedupe non-permission events. Permission requests carry a
      // unique request_id and must hold the socket open for the
      // renderer's reply, so we never drop them here.
      const isPerm = ev?.kind === "permission_request";
      const dup = ev && !isPerm && hookDedupe.isDuplicate(payload, eventName);
      // Per-event log is high-volume (fires every tool call across
      // every wielder) — gated behind an env var so it doesn't spam
      // dev output and can't trigger EPIPE storms when stdio is dodgy.
      if (process.env.KEYKEEPER_DEBUG_BRIDGE) {
        console.log(
          `[keykeeper/bridge] hook ${eventName} sid=${sid.slice(0, 12)} → ${
            ev ? `${ev.tool}/${ev.kind}${dup ? " DEDUP" : ""}` : "DROPPED"
          }`
        );
      }
      if (!ev || dup) {
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
        pending.set(id, {
          socket,
          sessionId: ev.sessionId,
          cwd: ev.cwd,
          tool: ev.tool,
          options: permissionOptionsForPayload(ev.tool, ev.payload),
        });
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
            { sessionId: p.sessionId, cwd: p.cwd, tool: p.tool },
            id,
            "error"
          );
        }
      }
      socket.destroy();
    });
    // If the provider kills the hook process (for example Gemini using an
    // old short timeout), "close" can fire without an "error". Drop the
    // pending entry and clear actionable letters so clicks don't appear to
    // do nothing. Cursor letters are observational handoffs, so they stay as
    // local context while Cursor's native dialog handles the real decision.
    socket.on("close", () => {
      for (const [id, p] of pending) {
        if (p.socket !== socket) continue;
        pending.delete(id);
        if (p.tool !== "cursor") {
          emitPermissionResolved(
            { sessionId: p.sessionId, cwd: p.cwd, tool: p.tool },
            id,
            "error"
          );
        }
      }
    });
  });
  server.listen(SOCKET_PATH, () => {
    console.log("[keykeeper] hook bridge listening on", SOCKET_PATH);
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
  message?: string,
  optionId?: string
): boolean {
  const p = pending.get(requestId);
  if (!p) {
    console.log(
      `[keykeeper/bridge] resolve ${requestId} = ${decision} — NO PENDING ENTRY (already resolved or expired)`
    );
    return false;
  }
  if (!isAllowedPendingDecision(p.options, decision, optionId)) {
    console.log(
      `[keykeeper/bridge] resolve ${requestId} = ${decision} option=${optionId ?? "(none)"} — UNSUPPORTED OPTION`
    );
    return false;
  }
  pending.delete(requestId);
  try {
    // denyMessage is read by bin/keykeeper-hook and only emitted to the
    // upstream when behavior=deny — Claude's PermissionRequest contract
    // has no message field for allow, and Cursor's shape uses
    // user_message/agent_message instead.
    const reply = JSON.stringify({
      permissionDecision: decision,
      optionId,
      denyMessage: decision === "deny" ? (message ?? undefined) : undefined,
    });

    console.log(
      `[keykeeper/bridge] resolve ${requestId} (tool=${p.tool}) → ${reply}`
    );
    p.socket.end(reply);
  } catch (e) {
    console.log(`[keykeeper/bridge] resolve ${requestId} write FAILED:`, e);
  }
  return true;
}

function isAllowedPendingDecision(
  options: readonly PermissionOption[],
  decision: PermissionDecision,
  optionId?: string
): boolean {
  if (optionId) {
    const option = options.find((candidate) => candidate.id === optionId);
    if (option) return option.decision === decision;
  }
  return options.some((option) => option.decision === decision);
}

/**
 * Read-only inspector for diagnostics / tests.
 */
export function pendingPermissionCount(): number {
  return pending.size;
}
