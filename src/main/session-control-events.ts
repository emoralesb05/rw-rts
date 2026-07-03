import type { AgentEvent } from "@shared/events";
import type {
  ControlSessionRequest,
  ControlSessionResponse,
} from "@shared/schemas";

export type SessionControlEventFallback = {
  sessionId?: string;
  cwd: string;
  now?: number;
};

export function sessionControlEventFor(
  req: ControlSessionRequest,
  response: ControlSessionResponse,
  fallback: SessionControlEventFallback
): AgentEvent | null {
  if ((req.action === "send" || req.action === "steer") && response.ok) {
    return null;
  }
  return {
    sessionId: req.sessionId ?? fallback.sessionId ?? req.unitId,
    tool: req.tool,
    cwd: req.cwd ?? fallback.cwd,
    timestamp: fallback.now ?? Date.now(),
    kind: "session_control",
    payload: {
      controlAction: req.action,
      ok: response.ok,
      reason: response.reason,
      reasonCode: response.reasonCode,
    },
    source: "realmkeeper",
  };
}
