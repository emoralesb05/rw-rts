import type { AgentEvent } from "@shared/events";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  MonitorDelta,
  MonitorSnapshot,
  UpdateAttentionRequest,
} from "@shared/schemas";
import { MonitorAttention } from "./monitor-attention";
import { listProviderSessions } from "../provider-sessions";
import { HerdrMonitorSource } from "./herdr-source";
import { MonitorService } from "./monitor-service";
import { MonitorHistoryStore } from "./monitor-history";

const PROVIDER_POLL_MS = 15_000;
const FRESHNESS_TICK_MS = 1_000;

type MonitorRuntimeOptions = {
  herdrEnabled?: boolean;
  historyFile?: string;
  attentionFile?: string;
};

export class MonitorRuntime {
  private readonly service: MonitorService;
  private readonly attention: MonitorAttention;
  private readonly herdr: HerdrMonitorSource;
  private readonly herdrEnabled: boolean;
  private pollTimer: NodeJS.Timeout | undefined;
  private tickTimer: NodeJS.Timeout | undefined;
  private pollRunning = false;
  private lifecycle = 0;
  private readonly history: MonitorHistoryStore;
  private historyTimer: NodeJS.Timeout | undefined;
  private reportedAttentionWarning?: string;

  constructor(options: MonitorRuntimeOptions = {}) {
    this.attention = new MonitorAttention(
      options.attentionFile ??
        join(
          options.historyFile
            ? dirname(options.historyFile)
            : join(homedir(), ".realmkeeper", "monitor"),
          "attention.json"
        )
    );
    this.service = new MonitorService(Date.now, this.attention);
    this.herdrEnabled = options.herdrEnabled ?? true;
    this.herdr = new HerdrMonitorSource(this.service);
    this.history = new MonitorHistoryStore(
      options.historyFile ??
        join(homedir(), ".realmkeeper", "monitor", "last-seen.json")
    );
    this.service.subscribe((delta) =>
      this.history.observe(delta.upsertedAgents)
    );
  }

  start(): void {
    if (this.pollTimer) return;
    this.lifecycle += 1;
    this.history.load();
    this.attention.load();
    this.reportAttentionHealth();
    this.history.checkpoint();
    this.historyTimer = setInterval(
      () => this.history.checkpoint(),
      PROVIDER_POLL_MS
    );
    if (this.herdrEnabled) this.herdr.start();
    void this.refreshInventory();
    this.pollTimer = setInterval(
      () => void this.refreshInventory(),
      PROVIDER_POLL_MS
    );
    this.tickTimer = setInterval(() => {
      this.service.tick();
      this.reportAttentionHealth();
    }, FRESHNESS_TICK_MS);
  }

  stop(): void {
    if (this.historyTimer) {
      clearInterval(this.historyTimer);
      this.historyTimer = undefined;
      this.history.checkpoint();
    }
    this.lifecycle += 1;
    if (this.herdrEnabled) this.herdr.stop();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.pollTimer = undefined;
    this.tickTimer = undefined;
  }

  ingestAgentEvent(event: AgentEvent): void {
    this.service.ingestAgentEvent(event);
  }

  updateAttention(req: UpdateAttentionRequest): void {
    try {
      this.service.updateAttention(req);
    } finally {
      this.reportAttentionHealth();
    }
  }

  private reportAttentionHealth(): void {
    if (
      !this.attention.warning ||
      this.attention.warning === this.reportedAttentionWarning
    )
      return;
    this.reportedAttentionWarning = this.attention.warning;
    this.service.setIntegrationHealth({
      sourceId: "attention-preferences",
      sourceKind: "realmkeeper-event",
      label: "Attention preferences",
      status: "degraded",
      configured: true,
      lastError: this.attention.warning,
      capabilities: [],
    });
  }

  subscribe(listener: (delta: MonitorDelta) => void): () => void {
    return this.service.subscribe((delta) =>
      listener({ ...delta, history: this.history.snapshot() })
    );
  }

  getSnapshot(): MonitorSnapshot {
    return { ...this.service.getSnapshot(), history: this.history.snapshot() };
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
