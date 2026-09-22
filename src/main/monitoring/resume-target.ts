import type {
  AgentMonitorRecord,
  ControlSessionRequest,
} from "@shared/schemas";

/** Resolve against live main-owned records, never checkpoint history or UI status. */
export function resumeTarget(
  request: ControlSessionRequest,
  agents: AgentMonitorRecord[]
): AgentMonitorRecord | undefined {
  return agents.find(
    (agent) =>
      agent.providerId === request.tool &&
      agent.tool === request.tool &&
      Boolean(agent.nativeSessionId && agent.cwd) &&
      agent.nativeSessionId === request.sessionId &&
      agent.cwd === request.cwd &&
      (agent.sourceLocalId ?? agent.nativeSessionId) === request.unitId &&
      agent.state === "done" &&
      agent.controls.some(
        (control) => control.action === "resume" && control.available
      )
  );
}
