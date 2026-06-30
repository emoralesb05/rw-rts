import { createServer } from "node:net";
import type { Server, Socket } from "node:net";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { bus } from "../event-bus";
import type { AgentEventSource, AgentTool } from "@shared/events";
import {
  HookPayloadSchema,
  type HookPayload,
  type PermissionDecision,
  type PermissionChoiceId,
  type PermissionOption,
  type PermissionRule,
  type UserInputAnswers,
} from "@shared/schemas";
import { permissionOptionsForPayload } from "@shared/provider-permissions";
import { createHookDedupe } from "./hook-dedupe";
import {
  claudeAskUserQuestionUpdatedInput,
  normalizeHookPayload,
} from "./hook-normalizer";
import {
  cancelUserInputRequest,
  registerUserInputRequest,
} from "./user-input-bridge";
import {
  matchPermissionRule,
  permissionChoiceDecision,
  permissionChoiceWritesRule,
  ruleFromPermissionChoice,
} from "../permission-rules";

export const SOCKET_PATH = join(homedir(), ".realmkeeper", "realmkeeper.sock");

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
 * `tool` is captured so error-path events get the right tool stamp.
 * Hook requests hold a socket open; app-server requests register an
 * in-process resolver callback. The renderer uses the same
 * ResolvePermission IPC path for both.
 */
type Pending = {
  sessionId: string;
  cwd: string;
  tool: AgentTool;
  source: AgentEventSource;
  options: PermissionOption[];
  name?: unknown;
  input?: unknown;
  repoRoot?: string;
  socket?: Socket;
  resolve?: (resolution: PendingPermissionResolution) => void | Promise<void>;
};
type PendingPermissionResolution = {
  decision: PermissionDecision;
  message?: string;
  optionId?: string;
};
type RegisterPermissionResult =
  | { status: "registered" }
  | {
      status: "auto-resolved";
      rule: PermissionRule;
      decision: PermissionDecision;
    }
  | { status: "duplicate" };
const pending = new Map<string, Pending>();
const hookDedupe = createHookDedupe();
const pendingUserInputSockets = new Map<Socket, string>();

function emitPermissionResolved(
  ctx: {
    sessionId: string;
    cwd: string;
    tool: AgentTool;
    source?: AgentEventSource;
  },
  requestId: string,
  resolution: "allow" | "deny" | "error",
  details?: {
    optionId?: string;
    choiceId?: PermissionChoiceId;
    rule?: PermissionRule;
    name?: unknown;
    input?: unknown;
  }
) {
  bus.emitAgentEvent({
    sessionId: ctx.sessionId,
    tool: ctx.tool,
    cwd: ctx.cwd,
    source: ctx.source ?? "hook",
    timestamp: Date.now(),
    kind: "permission_resolved",
    payload: {
      requestId,
      resolution,
      decision: resolution === "error" ? undefined : resolution,
      optionId: details?.optionId,
      choiceId: details?.choiceId,
      ruleId: details?.rule?.id,
      ruleLabel: details?.rule?.label,
      ruleScope: details?.rule?.scope,
      name: typeof details?.name === "string" ? details.name : undefined,
      input: details?.input,
    },
  });
}

export function registerPermissionRequest(
  ctx: {
    sessionId: string;
    cwd: string;
    tool: AgentTool;
    source?: AgentEventSource;
  },
  requestId: string,
  options: PermissionOption[],
  resolve: (resolution: PendingPermissionResolution) => void | Promise<void>
): boolean {
  return (
    registerPermissionRequestWithRules(ctx, requestId, options, resolve)
      .status === "registered"
  );
}

export function registerPermissionRequestWithRules(
  ctx: {
    sessionId: string;
    cwd: string;
    tool: AgentTool;
    source?: AgentEventSource;
  },
  requestId: string,
  options: PermissionOption[],
  resolve: (resolution: PendingPermissionResolution) => void | Promise<void>,
  details?: { name?: unknown; input?: unknown; repoRoot?: string }
): RegisterPermissionResult {
  if (pending.has(requestId)) return { status: "duplicate" };
  const match = matchPermissionRule({
    provider: ctx.tool,
    sessionId: ctx.sessionId,
    cwd: ctx.cwd,
    repoRoot: details?.repoRoot,
    name: details?.name,
    input: details?.input,
  });
  if (
    match &&
    isAllowedPendingDecision(
      options,
      match.decision,
      optionIdForDecision(options, match.decision)
    )
  ) {
    const optionId = optionIdForDecision(options, match.decision);
    try {
      void Promise.resolve(
        resolve({ decision: match.decision, optionId })
      ).catch((err: unknown) => {
        console.log(
          `[realmkeeper/bridge] auto resolve ${requestId} callback FAILED:`,
          err
        );
      });
    } catch (e) {
      console.log(
        `[realmkeeper/bridge] auto resolve ${requestId} callback FAILED:`,
        e
      );
    }
    emitPermissionResolved(ctx, requestId, match.decision, {
      optionId,
      rule: match.rule,
      name: details?.name,
      input: details?.input,
    });
    return {
      status: "auto-resolved",
      rule: match.rule,
      decision: match.decision,
    };
  }
  pending.set(requestId, {
    sessionId: ctx.sessionId,
    cwd: ctx.cwd,
    tool: ctx.tool,
    source: ctx.source ?? "realmkeeper",
    options,
    name: details?.name,
    input: details?.input,
    repoRoot: details?.repoRoot,
    resolve,
  });
  return { status: "registered" };
}

export function cancelPermissionRequest(requestId: string): boolean {
  const p = pending.get(requestId);
  if (!p) return false;
  pending.delete(requestId);
  emitPermissionResolved(p, requestId, "error");
  return true;
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
  // Ensure ~/.realmkeeper/ exists before binding the socket inside it.
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
      // Dedupe fire-and-forget events. Permission and user-input requests
      // carry unique request ids and must hold the socket open for the
      // renderer's reply, so we never drop them here.
      const isPerm = ev?.kind === "permission_request";
      const isUserInput = ev?.kind === "user_input_request";
      const dup =
        ev &&
        !isPerm &&
        !isUserInput &&
        hookDedupe.isDuplicate(payload, eventName);
      // Per-event log is high-volume (fires every tool call across
      // every wielder) — gated behind an env var so it doesn't spam
      // dev output and can't trigger EPIPE storms when stdio is dodgy.
      if (process.env.REALMKEEPER_DEBUG_BRIDGE) {
        console.log(
          `[realmkeeper/bridge] hook ${eventName} sid=${sid.slice(0, 12)} → ${
            ev ? `${ev.tool}/${ev.kind}${dup ? " DEDUP" : ""}` : "DROPPED"
          }`
        );
      }
      if (!ev || dup) {
        socket.destroy();
        return;
      }
      if (ev.kind === "user_input_request" && ev.payload.requestId) {
        const id = ev.payload.requestId;
        const registered = registerUserInputRequest(
          {
            sessionId: ev.sessionId,
            cwd: ev.cwd,
            tool: ev.tool,
            source: ev.source,
          },
          id,
          ({ answers }) => {
            pendingUserInputSockets.delete(socket);
            socket.end(
              JSON.stringify(
                claudeAskUserQuestionReply(payload.tool_input, answers)
              )
            );
          }
        );
        if (!registered) {
          socket.destroy();
          return;
        }
        pendingUserInputSockets.set(socket, id);
        bus.emitAgentEvent(ev);
        return;
      }
      // permission_request needs the socket kept open until the renderer
      // resolves it. All other events are fire-and-forget.
      if (ev.kind === "permission_request" && ev.payload.requestId) {
        const id = ev.payload.requestId;
        // No timer — the entry stays open until the GUI resolves it,
        // the socket errors, or the bridge shuts down (e.g. main exit).
        // Python's recv() blocks the same way; if the GUI dies, socket
        // tear-down will surface as recv EOF on its end.
        const options = permissionOptionsForPayload(ev.tool, ev.payload);
        const result = registerPermissionRequestWithRules(
          {
            sessionId: ev.sessionId,
            cwd: ev.cwd,
            tool: ev.tool,
            source: ev.source,
          },
          id,
          options,
          (resolution) => {
            socket.end(permissionReplyJson(ev.tool, resolution));
          },
          {
            name: ev.payload.name,
            input: ev.payload.input,
            repoRoot: ev.repoRoot,
          }
        );
        if (result.status === "duplicate") {
          socket.destroy();
          return;
        }
        if (result.status === "registered") {
          const p = pending.get(id);
          if (p) p.socket = socket;
          bus.emitAgentEvent(ev);
        }
      } else {
        bus.emitAgentEvent(ev);
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
          emitPermissionResolved(p, id, "error");
        }
      }
      const userInputRequestId = pendingUserInputSockets.get(socket);
      if (userInputRequestId) {
        pendingUserInputSockets.delete(socket);
        cancelUserInputRequest(userInputRequestId);
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
          emitPermissionResolved(p, id, "error");
        }
      }
      const userInputRequestId = pendingUserInputSockets.get(socket);
      if (userInputRequestId) {
        pendingUserInputSockets.delete(socket);
        cancelUserInputRequest(userInputRequestId);
      }
    });
  });
  server.listen(SOCKET_PATH, () => {
    console.log("[realmkeeper] hook bridge listening on", SOCKET_PATH);
  });
}

export function stopHookBridge() {
  // Resolve any pending requests with a silent close so Python isn't
  // stuck waiting for us across a restart.
  for (const [id, p] of pending) {
    try {
      p.socket?.end();
    } catch {
      /* ignore */
    }
    if (!p.socket) emitPermissionResolved(p, id, "error");
  }
  for (const [socket, id] of pendingUserInputSockets) {
    try {
      socket.end();
    } catch {
      /* ignore */
    }
    cancelUserInputRequest(id);
  }
  pendingUserInputSockets.clear();
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
  return resolvePendingPermissionRequest(requestId, {
    decision,
    message,
    optionId,
  });
}

export function applyPermissionChoiceRequest(
  requestId: string,
  choiceId: PermissionChoiceId,
  message?: string,
  optionId?: string
): boolean {
  const p = pending.get(requestId);
  if (!p) {
    console.log(
      `[realmkeeper/bridge] choice ${requestId} = ${choiceId} — NO PENDING ENTRY (already resolved or expired)`
    );
    return false;
  }
  const decision = permissionChoiceDecision(choiceId);
  const resolvedOptionId = optionId ?? optionIdForDecision(p.options, decision);
  if (permissionChoiceWritesRule(choiceId)) {
    const rule = ruleFromPermissionChoice(choiceId, {
      provider: p.tool,
      sessionId: p.sessionId,
      cwd: p.cwd,
      repoRoot: p.repoRoot,
      name: p.name,
      input: p.input,
      requestId,
    });
    if (!rule) {
      console.log(
        `[realmkeeper/bridge] choice ${requestId} = ${choiceId} — COULD NOT CREATE RULE`
      );
      return false;
    }
    return resolvePendingPermissionRequest(
      requestId,
      {
        decision,
        message,
        optionId: resolvedOptionId,
      },
      { choiceId, rule }
    );
  }
  return resolvePendingPermissionRequest(requestId, {
    decision,
    message,
    optionId: resolvedOptionId,
  });
}

function resolvePendingPermissionRequest(
  requestId: string,
  resolution: PendingPermissionResolution,
  audit?: { choiceId?: PermissionChoiceId; rule?: PermissionRule }
): boolean {
  const p = pending.get(requestId);
  if (!p) {
    console.log(
      `[realmkeeper/bridge] resolve ${requestId} = ${resolution.decision} — NO PENDING ENTRY (already resolved or expired)`
    );
    return false;
  }
  if (
    !isAllowedPendingDecision(
      p.options,
      resolution.decision,
      resolution.optionId
    )
  ) {
    console.log(
      `[realmkeeper/bridge] resolve ${requestId} = ${resolution.decision} option=${resolution.optionId ?? "(none)"} — UNSUPPORTED OPTION`
    );
    return false;
  }
  pending.delete(requestId);
  if (p.resolve) {
    try {
      void Promise.resolve(p.resolve(resolution)).catch((err: unknown) => {
        console.log(
          `[realmkeeper/bridge] resolve ${requestId} callback FAILED:`,
          err
        );
      });
    } catch (e) {
      console.log(
        `[realmkeeper/bridge] resolve ${requestId} callback FAILED:`,
        e
      );
    }
    if (audit?.rule) {
      emitPermissionResolved(p, requestId, resolution.decision, {
        optionId: resolution.optionId,
        choiceId: audit.choiceId,
        rule: audit.rule,
        name: p.name,
        input: p.input,
      });
    }
    return true;
  }
  if (!p.socket) {
    console.log(
      `[realmkeeper/bridge] resolve ${requestId} = ${resolution.decision} — NO REPLY CHANNEL`
    );
    return false;
  }
  try {
    // denyMessage is read by bin/realmkeeper-hook and only emitted to the
    // upstream when behavior=deny — Claude's PermissionRequest contract
    // has no message field for allow, and Cursor's shape uses
    // user_message/agent_message instead.
    const reply = permissionReplyJson(p.tool, resolution);

    console.log(
      `[realmkeeper/bridge] resolve ${requestId} (tool=${p.tool}) → ${reply}`
    );
    p.socket.end(reply);
  } catch (e) {
    console.log(`[realmkeeper/bridge] resolve ${requestId} write FAILED:`, e);
  }
  if (audit?.rule) {
    emitPermissionResolved(p, requestId, resolution.decision, {
      optionId: resolution.optionId,
      choiceId: audit.choiceId,
      rule: audit.rule,
      name: p.name,
      input: p.input,
    });
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

function optionIdForDecision(
  options: readonly PermissionOption[],
  decision: PermissionDecision
): string | undefined {
  return options.find((option) => option.decision === decision)?.id;
}

function permissionReplyJson(
  _tool: AgentTool,
  resolution: PendingPermissionResolution
): string {
  return JSON.stringify({
    permissionDecision: resolution.decision,
    optionId: resolution.optionId,
    denyMessage:
      resolution.decision === "deny"
        ? (resolution.message ?? undefined)
        : undefined,
  });
}

/**
 * Read-only inspector for diagnostics / tests.
 */
export function pendingPermissionCount(): number {
  return pending.size;
}

function claudeAskUserQuestionReply(
  toolInput: unknown,
  answers: UserInputAnswers
): Record<string, unknown> {
  const updatedInput = claudeAskUserQuestionUpdatedInput(toolInput, answers);
  if (!updatedInput) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason: "Skipped by Realmkeeper.",
    };
  }
  return {
    permissionDecision: "allow",
    updatedInput,
  };
}
