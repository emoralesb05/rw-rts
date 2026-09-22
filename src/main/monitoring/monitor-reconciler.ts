import type { UnitState } from "@shared/events";
import type {
  AgentMonitorRecord,
  AgentTool,
  MonitorAttentionItem,
  MonitorIntegrationHealth,
  MonitorObservation,
  MonitorSnapshot,
} from "@shared/schemas";
import {
  SESSION_CONTROL_NAMES,
  resolveSessionCapabilities,
} from "@shared/session-capabilities";
import { MONITOR_AUTHORITY_WEIGHT, MONITOR_FRESHNESS } from "./monitor-policy";
import { MONITOR_STATE_WEIGHT } from "@shared/monitoring-order";

export function effectiveObservation(
  observation: MonitorObservation,
  now: number
): MonitorObservation | undefined {
  if (!observation.expiresAt || now <= observation.expiresAt)
    return observation;
  if (
    (observation.state === "done" || observation.state === "failed") &&
    observation.offlineAt === observation.expiresAt &&
    now > observation.offlineAt
  ) {
    return undefined;
  }
  if (now <= (observation.offlineAt ?? observation.expiresAt)) {
    return {
      ...observation,
      state: "unknown",
      confidence: "stale",
      stateReason: `${sourceLabel(observation.sourceKind)} evidence is stale`,
      currentActivity: undefined,
    };
  }
  if (now - observation.observedAt > MONITOR_FRESHNESS.terminalRetentionMs) {
    return undefined;
  }
  return {
    ...observation,
    state: "offline",
    confidence: "stale",
    stateReason: `${sourceLabel(observation.sourceKind)} has not reported recently`,
    currentActivity: undefined,
  };
}

export function observationAgentId(observation: MonitorObservation): string {
  if (observation.nativeSessionId) {
    return `${observation.providerId}:${observation.nativeSessionId}`;
  }
  return `${observation.sourceId}:${observation.sourceLocalId ?? observation.observationId}`;
}

export function reconcileAgent(
  agentId: string,
  evidence: MonitorObservation[]
): AgentMonitorRecord {
  const sorted = [...evidence].sort(observationSort);
  const winner = sorted[0];
  const metadata = [...evidence].sort((a, b) => b.observedAt - a.observedAt);
  const newest = metadata[0];
  const spawnedHere = evidence.some((item) => item.spawnedHere);
  const capabilities = winner.tool
    ? resolveSessionCapabilities({
        tool: winner.tool,
        spawnedHere,
        status: sessionStatus(winner.state),
        activeTurnKnown: winner.state === "working",
      })
    : undefined;

  return {
    agentId,
    providerId: winner.providerId,
    tool: winner.tool,
    nativeSessionId: winner.nativeSessionId,
    sourceLocalId: winner.sourceLocalId,
    displayName:
      metadata.find((item) => item.displayName)?.displayName ??
      winner.nativeSessionId ??
      winner.sourceLocalId ??
      `${providerLabel(winner.tool ?? winner.providerId)} agent`,
    cwd: metadata.find((item) => item.cwd)?.cwd,
    repoRoot: metadata.find((item) => item.repoRoot)?.repoRoot,
    worktree: metadata.find((item) => item.worktree)?.worktree,
    branch: metadata.find((item) => item.branch)?.branch,
    model: metadata.find((item) => item.model)?.model,
    state: winner.state,
    stateReason: winner.stateReason ?? "No state reason reported",
    authority: winner.authority,
    confidence: winner.confidence,
    lastObservedAt: newest.observedAt,
    freshUntil: winner.expiresAt,
    currentActivity: winner.currentActivity,
    spawnedHere,
    herdrPaneId: metadata.find((item) => item.herdrPaneId)?.herdrPaneId,
    sources: [...new Set(evidence.map((item) => item.sourceId))].sort(),
    evidence: sorted.map((item) => ({
      observationId: item.observationId,
      observedAt: item.observedAt,
      expiresAt: item.expiresAt,
      offlineAt: item.offlineAt,
      sourceId: item.sourceId,
      sourceKind: item.sourceKind,
      authority: item.authority,
      confidence: item.confidence,
      state: item.state,
      stateReason: item.stateReason,
      currentActivity: item.currentActivity,
      attentionKind: item.attentionKind,
    })),
    controls:
      capabilities === undefined
        ? []
        : SESSION_CONTROL_NAMES.map((action) => ({
            action,
            ...capabilities.controls[action],
          })),
    usage: metadata.find((item) => item.usage)?.usage ?? {
      coverage: "unavailable",
    },
  };
}

export function attentionFor(
  agents: AgentMonitorRecord[],
  integrations: MonitorIntegrationHealth[]
): MonitorAttentionItem[] {
  const items = agents.flatMap(agentAttention);
  for (const integration of integrations) {
    if (integration.status === "healthy") continue;
    items.push({
      attentionId: `integration:${integration.sourceId}`,
      kind: "integration",
      severity: integration.status === "degraded" ? "warning" : "info",
      title: `${integration.label} ${integration.status}`,
      summary:
        integration.lastError ??
        "This source is not available; other monitor sources continue working.",
      sourceId: integration.sourceId,
      openedAt: integration.lastErrorAt ?? 0,
      updatedAt: integration.lastErrorAt ?? 0,
      lifecycle: "open",
    });
  }
  return items.sort(
    (a, b) =>
      severityWeight(b.severity) - severityWeight(a.severity) ||
      a.openedAt - b.openedAt
  );
}

export function visibleSnapshot(snapshot: MonitorSnapshot): string {
  return JSON.stringify({
    agents: snapshot.agents,
    attention: snapshot.attention,
    integrations: snapshot.integrations,
  });
}

function agentAttention(agent: AgentMonitorRecord): MonitorAttentionItem[] {
  const evidenceKind = agent.evidence[0]?.attentionKind;
  const kind =
    evidenceKind ??
    (agent.state === "failed"
      ? "failure"
      : agent.state === "ready"
        ? "ready"
        : agent.state === "offline"
          ? "disconnected"
          : undefined);
  if (!kind) return [];
  return [
    {
      attentionId: `${kind}:${agent.agentId}`,
      kind,
      severity:
        kind === "permission" || kind === "question" || kind === "failure"
          ? "critical"
          : kind === "disconnected" || kind === "stuck"
            ? "warning"
            : "info",
      title: attentionTitle(kind),
      summary: `${agent.displayName}: ${agent.stateReason}`,
      agentId: agent.agentId,
      sourceId: agent.evidence[0]?.sourceId ?? "unknown",
      openedAt: agent.evidence[0]?.observedAt ?? agent.lastObservedAt,
      updatedAt: agent.lastObservedAt,
      lifecycle: "open",
    },
  ];
}

function attentionTitle(kind: MonitorAttentionItem["kind"]): string {
  if (kind === "permission") return "Permission needed";
  if (kind === "question") return "Answer needed";
  if (kind === "failure") return "Agent failed";
  if (kind === "stuck") return "Agent blocked";
  if (kind === "ready") return "Ready for review";
  return "Agent disconnected";
}

function observationSort(a: MonitorObservation, b: MonitorObservation): number {
  const aFresh = a.confidence === "stale" ? 0 : 1;
  const bFresh = b.confidence === "stale" ? 0 : 1;
  return (
    bFresh - aFresh ||
    MONITOR_AUTHORITY_WEIGHT[b.authority] -
      MONITOR_AUTHORITY_WEIGHT[a.authority] ||
    b.observedAt - a.observedAt ||
    MONITOR_STATE_WEIGHT[b.state] - MONITOR_STATE_WEIGHT[a.state]
  );
}

function severityWeight(severity: MonitorAttentionItem["severity"]): number {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function sessionStatus(
  state: AgentMonitorRecord["state"]
): UnitState["status"] {
  if (state === "working") return "working";
  if (state === "done" || state === "ready") return "complete";
  if (state === "failed") return "fallen";
  return "idle";
}

function sourceLabel(kind: MonitorObservation["sourceKind"]): string {
  if (kind === "provider-inventory") return "Provider inventory";
  if (kind === "realmkeeper-event") return "Activity stream";
  if (kind === "herdr") return "Herdr";
  return "Usage source";
}

function providerLabel(tool: AgentTool | string): string {
  return tool.charAt(0).toUpperCase() + tool.slice(1);
}
