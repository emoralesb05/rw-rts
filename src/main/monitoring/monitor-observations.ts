import type { AgentEvent } from "@shared/events";
import type {
  MonitorAgentState,
  MonitorObservation,
  ProviderSessionEntry,
} from "@shared/schemas";
import { MONITOR_FRESHNESS } from "./monitor-policy";

export function eventAgentId(event: AgentEvent): string {
  return canonicalAgentId(event.tool, nativeSessionIdFor(event));
}

export function blockingObservationForEvent(
  event: AgentEvent
): MonitorObservation {
  const isPermission = event.kind === "permission_request";
  const nativeSessionId = nativeSessionIdFor(event);
  const agentId = canonicalAgentId(event.tool, nativeSessionId);
  return {
    ...eventBase(event, nativeSessionId),
    observationId: `event:block:${agentId}`,
    authority: "blocking",
    confidence: "high",
    state: "blocked",
    stateReason: isPermission
      ? "Waiting for permission"
      : "Waiting for user input",
    currentActivity: isPermission
      ? "Permission decision required"
      : "Answer required",
    attentionKind: isPermission ? "permission" : "question",
    revision: `${event.kind}:${event.timestamp}`,
  };
}

export function activityObservationForEvent(
  event: AgentEvent
): MonitorObservation {
  const terminal = event.kind === "session_end";
  const nativeSessionId = nativeSessionIdFor(event);
  const agentId = canonicalAgentId(event.tool, nativeSessionId);
  return {
    ...eventBase(event, nativeSessionId),
    observationId: `event:activity:${agentId}`,
    expiresAt:
      event.timestamp +
      (terminal
        ? MONITOR_FRESHNESS.terminalRetentionMs
        : MONITOR_FRESHNESS.eventFreshMs),
    offlineAt:
      event.timestamp +
      (terminal
        ? MONITOR_FRESHNESS.terminalRetentionMs
        : MONITOR_FRESHNESS.eventOfflineMs),
    authority: "heuristic",
    confidence: terminal ? "high" : "medium",
    state: stateForEvent(event),
    stateReason: reasonForEvent(event),
    currentActivity: activityForEvent(event),
    attentionKind: event.kind === "error" ? "failure" : undefined,
    revision: `${event.kind}:${event.timestamp}`,
  };
}

export function providerObservation(
  session: ProviderSessionEntry,
  observedAt: number
): MonitorObservation {
  const previewDerivedName =
    session.tool === "codex" &&
    session.preview &&
    session.displayName === session.preview.slice(0, 80);
  return {
    observationId: `inventory:${session.tool}:${session.providerSessionId}`,
    observedAt,
    expiresAt: observedAt + MONITOR_FRESHNESS.providerFreshMs,
    offlineAt: observedAt + MONITOR_FRESHNESS.providerOfflineMs,
    sourceId: `provider-inventory:${session.tool}`,
    sourceKind: "provider-inventory",
    authority: "provider",
    confidence: "high",
    providerId: session.tool,
    tool: session.tool,
    nativeSessionId: session.providerSessionId,
    displayName: previewDerivedName
      ? `Codex ${shortId(session.providerSessionId)}`
      : session.displayName,
    cwd: session.cwd,
    state: providerState(session.status),
    stateReason: `Provider reports ${session.status}`,
    currentActivity: `Provider reports ${session.status}`,
    spawnedHere: false,
    revision: `${observedAt}:${session.updatedAt ?? session.createdAt ?? "unknown"}`,
  };
}

function eventBase(event: AgentEvent, nativeSessionId: string) {
  return {
    observedAt: event.timestamp,
    sourceId: "realmkeeper-events",
    sourceKind: "realmkeeper-event" as const,
    providerId: event.tool,
    tool: event.tool,
    nativeSessionId,
    sourceLocalId: event.sessionId,
    cwd: event.cwd,
    repoRoot: event.repoRoot,
    spawnedHere: event.source === "spawned",
  };
}

function nativeSessionIdFor(event: AgentEvent): string {
  return (
    stringValue(event.payload.providerSessionId) ??
    stringValue(event.payload.providerConversationId) ??
    stringValue(event.payload.cursorChatId) ??
    event.sessionId
  );
}

function canonicalAgentId(providerId: string, nativeSessionId: string): string {
  return `${providerId}:${nativeSessionId}`;
}

function providerState(
  state: ProviderSessionEntry["status"]
): MonitorAgentState {
  if (state === "busy" || state === "working" || state === "active") {
    return "working";
  }
  if (state === "idle") return "idle";
  if (state === "complete") return "done";
  if (state === "failed") return "failed";
  return "unknown";
}

function stateForEvent(event: AgentEvent): MonitorAgentState {
  if (event.kind === "session_end") return "done";
  if (event.kind === "error") return "failed";
  if (event.kind === "session_start") return "idle";
  return "working";
}

function reasonForEvent(event: AgentEvent): string {
  switch (event.kind) {
    case "session_start":
      return "Session started";
    case "session_end":
      return "Session ended";
    case "error":
      return stringValue(event.payload.error) ?? "Agent reported an error";
    case "tool_use":
      return `Using ${stringValue(event.payload.name) ?? "a tool"}`;
    case "tool_result":
      return "Tool call completed";
    case "assistant_text":
      return "Agent responded";
    case "user_prompt":
      return "Prompt received";
    case "subagent_spawn":
      return "Subagent started";
    case "session_control":
      return stringValue(event.payload.controlAction)
        ? `Control: ${String(event.payload.controlAction)}`
        : "Session control updated";
    case "orchestration_event":
      return "Workflow updated";
    case "permission_resolved":
      return "Permission resolved";
    case "user_input_resolved":
      return "Input resolved";
    case "permission_request":
    case "user_input_request":
      return "Waiting for input";
  }
}

function activityForEvent(event: AgentEvent): string | undefined {
  if (event.kind === "tool_use") {
    return `Tool · ${stringValue(event.payload.name) ?? "unknown"}`;
  }
  if (event.kind === "error") return "Error reported";
  if (event.kind === "session_end") return "Finished";
  if (event.kind === "assistant_text") return "Writing response";
  if (event.kind === "subagent_spawn") return "Spawning subagent";
  if (event.kind === "orchestration_event") return "Running workflow";
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function shortId(value: string): string {
  return value.length > 12 ? value.slice(0, 8) : value;
}
