import { bus } from "../event-bus";
import type { AgentEventSource, AgentTool } from "@shared/events";
import type { UserInputAnswers } from "@shared/schemas";

type PendingUserInputResolution = {
  answers: UserInputAnswers;
  responseKind?: "mcp-elicitation";
  responseAction?: "accept" | "decline" | "cancel";
};

type Pending = {
  sessionId: string;
  cwd: string;
  tool: AgentTool;
  source: AgentEventSource;
  resolve: (resolution: PendingUserInputResolution) => void | Promise<void>;
};

const pending = new Map<string, Pending>();

function emitUserInputResolved(
  ctx: {
    sessionId: string;
    cwd: string;
    tool: AgentTool;
    source?: AgentEventSource;
  },
  requestId: string,
  resolution: "error"
) {
  bus.emitAgentEvent({
    sessionId: ctx.sessionId,
    tool: ctx.tool,
    cwd: ctx.cwd,
    source: ctx.source ?? "realmkeeper",
    timestamp: Date.now(),
    kind: "user_input_resolved",
    payload: { requestId, resolution },
  });
}

export function registerUserInputRequest(
  ctx: {
    sessionId: string;
    cwd: string;
    tool: AgentTool;
    source?: AgentEventSource;
  },
  requestId: string,
  resolve: (resolution: PendingUserInputResolution) => void | Promise<void>
): boolean {
  if (pending.has(requestId)) return false;
  pending.set(requestId, {
    sessionId: ctx.sessionId,
    cwd: ctx.cwd,
    tool: ctx.tool,
    source: ctx.source ?? "realmkeeper",
    resolve,
  });
  return true;
}

export function cancelUserInputRequest(requestId: string): boolean {
  const p = pending.get(requestId);
  if (!p) return false;
  pending.delete(requestId);
  emitUserInputResolved(p, requestId, "error");
  return true;
}

export function resolveUserInputRequest(
  requestId: string,
  answers: UserInputAnswers,
  opts: {
    responseKind?: "mcp-elicitation";
    responseAction?: "accept" | "decline" | "cancel";
  } = {}
): boolean {
  const p = pending.get(requestId);
  if (!p) {
    console.log(
      `[realmkeeper/user-input] resolve ${requestId} — NO PENDING ENTRY`
    );
    return false;
  }
  pending.delete(requestId);
  try {
    void Promise.resolve(p.resolve({ answers, ...opts })).catch(
      (err: unknown) => {
        console.log(
          `[realmkeeper/user-input] resolve ${requestId} callback FAILED:`,
          err
        );
      }
    );
  } catch (err) {
    console.log(
      `[realmkeeper/user-input] resolve ${requestId} callback FAILED:`,
      err
    );
  }
  return true;
}

export function pendingUserInputCount(): number {
  return pending.size;
}
