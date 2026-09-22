import type { AgentEvent } from "@shared/events";
import {
  MonitorObservationSchema,
  type AgentTool,
  type ListProviderSessionsResponse,
  type MonitorDelta,
  type MonitorIntegrationHealth,
  type MonitorObservation,
  type MonitorSnapshot,
} from "@shared/schemas";
import { compareMonitorAgents } from "@shared/monitoring-order";
import {
  activityObservationForEvent,
  blockingObservationForEvent,
  eventAgentId,
  providerObservation,
} from "./monitor-observations";
import {
  attentionFor,
  effectiveObservation,
  observationAgentId,
  reconcileAgent,
  visibleSnapshot,
} from "./monitor-reconciler";

export { MONITOR_FRESHNESS } from "./monitor-policy";

const DEFAULT_PROVIDER_TOOLS: AgentTool[] = [
  "claude",
  "codex",
  "cursor",
  "gemini",
];

type Clock = () => number;
type DeltaListener = (delta: MonitorDelta) => void;

export class MonitorService {
  private readonly observations = new Map<string, MonitorObservation>();
  private readonly slots = new Map<string, string>();
  private readonly integrations = new Map<string, MonitorIntegrationHealth>();
  private readonly listeners = new Set<DeltaListener>();
  private version = 0;
  private lastPublished: MonitorSnapshot | undefined;

  constructor(private readonly now: Clock = Date.now) {
    this.integrations.set("realmkeeper-events", {
      sourceId: "realmkeeper-events",
      sourceKind: "realmkeeper-event",
      label: "Realmkeeper event stream",
      status: "healthy",
      configured: true,
      lastSuccessAt: this.now(),
      capabilities: ["activity", "blocking", "lifecycle"],
    });
  }

  subscribe(listener: DeltaListener): () => void {
    this.listeners.add(listener);
    if (!this.lastPublished) this.lastPublished = this.getSnapshot();
    return () => this.listeners.delete(listener);
  }

  ingestObservation(value: MonitorObservation): void {
    this.ingestObservations([value]);
  }

  ingestObservations(values: MonitorObservation[]): void {
    let changed = false;
    for (const value of values) {
      const observation = MonitorObservationSchema.parse(value);
      const previous = this.observations.get(observation.observationId);
      if (
        previous?.revision &&
        observation.revision &&
        previous.revision === observation.revision
      ) {
        if (observation.observedAt > previous.observedAt) {
          // Renew freshness without treating the heartbeat as a semantic change.
          this.observations.set(observation.observationId, observation);
          changed = true;
        }
        continue;
      }
      this.observations.set(observation.observationId, observation);
      changed = true;
    }
    if (changed) this.commit();
  }

  ingestAgentEvent(event: AgentEvent): void {
    const agentId = eventAgentId(event);
    if (
      event.kind === "permission_resolved" ||
      event.kind === "user_input_resolved" ||
      event.kind === "session_end"
    ) {
      this.removeSlot(`event:block:${agentId}`);
    }

    if (
      event.kind === "permission_request" ||
      event.kind === "user_input_request"
    ) {
      this.putSlot(
        `event:block:${agentId}`,
        blockingObservationForEvent(event)
      );
      this.markEventHealthy(event.timestamp);
      this.commit();
      return;
    }

    this.putSlot(
      `event:activity:${agentId}`,
      activityObservationForEvent(event)
    );
    this.markEventHealthy(event.timestamp);
    this.commit();
  }

  ingestProviderSessions(
    result: ListProviderSessionsResponse,
    tools: AgentTool[] = DEFAULT_PROVIDER_TOOLS
  ): void {
    for (const session of result.sessions) {
      this.putSlot(
        `inventory:${session.tool}:${session.providerSessionId}`,
        providerObservation(session, result.generatedAt)
      );
    }

    const errors = new Map(result.errors.map((error) => [error.tool, error]));
    for (const tool of tools) {
      const error = errors.get(tool);
      const sourceId = `provider-inventory:${tool}`;
      this.integrations.set(sourceId, {
        sourceId,
        sourceKind: "provider-inventory",
        label: `${providerLabel(tool)} inventory`,
        status: error
          ? error.reasonCode === "not_implemented"
            ? "unavailable"
            : "degraded"
          : "healthy",
        configured: !error || error.reasonCode !== "not_implemented",
        lastSuccessAt: error ? undefined : result.generatedAt,
        lastErrorAt: error ? result.generatedAt : undefined,
        lastError: error?.message,
        capabilities: error ? [] : ["inventory", "native-session-id"],
      });
    }
    this.commit();
  }

  setIntegrationHealth(health: MonitorIntegrationHealth): void {
    this.integrations.set(health.sourceId, health);
    this.commit();
  }

  tick(): void {
    const next = this.getSnapshot();
    if (
      !this.lastPublished ||
      visibleSnapshot(next) !== visibleSnapshot(this.lastPublished)
    ) {
      this.version += 1;
      this.publish();
    }
  }

  getSnapshot(): MonitorSnapshot {
    const generatedAt = this.now();
    const grouped = new Map<string, MonitorObservation[]>();
    for (const observation of this.observations.values()) {
      const effective = effectiveObservation(observation, generatedAt);
      if (!effective) continue;
      const id = observationAgentId(effective);
      const list = grouped.get(id) ?? [];
      list.push(effective);
      grouped.set(id, list);
    }

    const agents = [...grouped.entries()]
      .map(([agentId, evidence]) => reconcileAgent(agentId, evidence))
      .sort(compareMonitorAgents);
    const integrations = [...this.integrations.values()].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    return {
      schemaVersion: 1,
      version: this.version,
      generatedAt,
      agents,
      attention: attentionFor(agents, integrations),
      integrations,
    };
  }

  private putSlot(slot: string, observation: MonitorObservation): void {
    const parsed = MonitorObservationSchema.parse(observation);
    const previousId = this.slots.get(slot);
    if (previousId && previousId !== parsed.observationId) {
      this.observations.delete(previousId);
    }
    this.slots.set(slot, parsed.observationId);
    this.observations.set(parsed.observationId, parsed);
  }

  private removeSlot(slot: string): void {
    const id = this.slots.get(slot);
    if (!id) return;
    this.slots.delete(slot);
    this.observations.delete(id);
  }

  private markEventHealthy(observedAt: number): void {
    this.integrations.set("realmkeeper-events", {
      sourceId: "realmkeeper-events",
      sourceKind: "realmkeeper-event",
      label: "Realmkeeper event stream",
      status: "healthy",
      configured: true,
      lastSuccessAt: observedAt,
      capabilities: ["activity", "blocking", "lifecycle"],
    });
  }

  private commit(): void {
    this.version += 1;
    this.publish();
  }

  private publish(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.getSnapshot();
    const previous = this.lastPublished;
    const previousById = new Map(
      (previous?.agents ?? []).map((agent) => [agent.agentId, agent])
    );
    const nextIds = new Set(snapshot.agents.map((agent) => agent.agentId));
    const delta: MonitorDelta = {
      schemaVersion: 1,
      version: snapshot.version,
      generatedAt: snapshot.generatedAt,
      upsertedAgents: snapshot.agents.filter(
        (agent) =>
          JSON.stringify(previousById.get(agent.agentId)) !==
          JSON.stringify(agent)
      ),
      removedAgentIds: [...previousById.keys()].filter(
        (agentId) => !nextIds.has(agentId)
      ),
      attention: snapshot.attention,
      integrations: snapshot.integrations,
    };
    this.lastPublished = snapshot;
    for (const listener of this.listeners) listener(delta);
  }
}

function providerLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
