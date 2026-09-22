import type { AgentEvent } from "@shared/events";
import type { MonitorDelta, MonitorSnapshot } from "@shared/schemas";
import { listProviderSessions } from "../provider-sessions";
import { HerdrMonitorSource } from "./herdr-source";
import { MonitorService } from "./monitor-service";

const PROVIDER_POLL_MS = 15_000;
const FRESHNESS_TICK_MS = 1_000;

export class MonitorRuntime {
  private readonly service = new MonitorService();
  private readonly herdr = new HerdrMonitorSource(this.service);
  private pollTimer: NodeJS.Timeout | undefined;
  private tickTimer: NodeJS.Timeout | undefined;
  private pollRunning = false;
  private lifecycle = 0;

  start(): void {
    if (this.pollTimer) return;
    this.lifecycle += 1;
    this.herdr.start();
    void this.refreshInventory();
    this.pollTimer = setInterval(
      () => void this.refreshInventory(),
      PROVIDER_POLL_MS
    );
    this.tickTimer = setInterval(() => this.service.tick(), FRESHNESS_TICK_MS);
  }

  stop(): void {
    this.lifecycle += 1;
    this.herdr.stop();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.pollTimer = undefined;
    this.tickTimer = undefined;
  }

  ingestAgentEvent(event: AgentEvent): void {
    this.service.ingestAgentEvent(event);
  }

  subscribe(listener: (delta: MonitorDelta) => void): () => void {
    return this.service.subscribe(listener);
  }

  getSnapshot(): MonitorSnapshot {
    return this.service.getSnapshot();
  }

  async focusAgent(agentId: string): Promise<void> {
    const agent = this.service
      .getSnapshot()
      .agents.find((entry) => entry.agentId === agentId);
    if (!agent?.herdrPaneId) {
      throw new Error("This agent has no current Herdr pane target.");
    }
    await this.herdr.focus(agent.herdrPaneId);
  }

  private async refreshInventory(): Promise<void> {
    if (this.pollRunning) return;
    const lifecycle = this.lifecycle;
    this.pollRunning = true;
    try {
      const sessions = await listProviderSessions();
      if (lifecycle !== this.lifecycle) return;
      this.service.ingestProviderSessions(sessions);
    } catch (cause) {
      if (lifecycle !== this.lifecycle) return;
      const now = Date.now();
      this.service.setIntegrationHealth({
        sourceId: "provider-inventory-runtime",
        sourceKind: "provider-inventory",
        label: "Provider inventory polling",
        status: "degraded",
        configured: true,
        lastErrorAt: now,
        lastError: cause instanceof Error ? cause.message : String(cause),
        capabilities: [],
      });
    } finally {
      this.pollRunning = false;
    }
  }
}
