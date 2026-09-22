import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type {
  AgentTool,
  MonitorIntegrationHealth,
  MonitorObservation,
} from "@shared/schemas";
import type { MonitorService } from "./monitor-service";

const execFileAsync = promisify(execFile);
const HERDR_POLL_MS = 3_000;
const HERDR_TIMEOUT_MS = 2_000;
const HERDR_FRESH_MS = 10_000;
const HERDR_OFFLINE_MS = 30_000;

const HerdrAgentSchema = z.looseObject({
  agent: z.string().min(1),
  agent_session: z
    .looseObject({
      value: z.string().min(1),
    })
    .optional(),
  agent_status: z.enum(["idle", "working", "blocked", "done", "unknown"]),
  cwd: z.string().min(1).optional(),
  pane_id: z.string().min(1),
  revision: z.number().int().nonnegative().optional(),
  state_change_seq: z.number().int().nonnegative().optional(),
});

const HerdrAgentListSchema = z.object({
  result: z.object({
    agents: z.array(HerdrAgentSchema),
  }),
});

type HerdrAgent = z.infer<typeof HerdrAgentSchema>;

export class HerdrMonitorSource {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private failures = 0;
  private version: string | undefined;
  private lastSuccessAt: number | undefined;
  private lifecycle = 0;

  constructor(
    private readonly service: MonitorService,
    private readonly now: () => number = Date.now
  ) {}

  start(): void {
    if (this.timer) return;
    this.lifecycle += 1;
    void this.detectVersion(this.lifecycle);
    void this.poll();
    this.timer = setInterval(() => void this.poll(), HERDR_POLL_MS);
  }

  stop(): void {
    this.lifecycle += 1;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async focus(paneId: string): Promise<void> {
    await execFileAsync("herdr", ["agent", "focus", paneId], {
      encoding: "utf8",
      timeout: HERDR_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
  }

  async poll(): Promise<void> {
    if (this.running) return;
    const lifecycle = this.lifecycle;
    this.running = true;
    try {
      const { stdout } = await execFileAsync("herdr", ["agent", "list"], {
        encoding: "utf8",
        timeout: HERDR_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
      });
      if (lifecycle !== this.lifecycle) return;
      const observedAt = this.now();
      const observations = normalizeHerdrAgentList(stdout, observedAt);
      this.failures = 0;
      this.lastSuccessAt = observedAt;
      this.service.ingestObservations(observations);
      this.service.setIntegrationHealth(
        this.health("healthy", true, ["presence", "native-session-id", "focus"])
      );
    } catch (cause) {
      if (lifecycle !== this.lifecycle) return;
      this.failures += 1;
      const unavailable = isMissingBinary(cause);
      if (unavailable || this.failures >= 2 || !this.lastSuccessAt) {
        this.service.setIntegrationHealth({
          ...this.health(
            unavailable ? "unavailable" : "degraded",
            !unavailable,
            []
          ),
          lastErrorAt: this.now(),
          lastError: errorMessage(cause),
        });
      }
    } finally {
      this.running = false;
    }
  }

  private async detectVersion(lifecycle: number): Promise<void> {
    try {
      const { stdout } = await execFileAsync("herdr", ["--version"], {
        encoding: "utf8",
        timeout: HERDR_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      if (lifecycle === this.lifecycle) {
        this.version = stdout.trim() || undefined;
      }
    } catch {
      // The poll reports the actionable health state.
    }
  }

  private health(
    status: MonitorIntegrationHealth["status"],
    configured: boolean,
    capabilities: string[]
  ): MonitorIntegrationHealth {
    return {
      sourceId: "herdr",
      sourceKind: "herdr",
      label: "Herdr",
      status,
      configured,
      lastSuccessAt: this.lastSuccessAt,
      version: this.version,
      capabilities,
    };
  }
}

export function normalizeHerdrAgentList(
  value: string | unknown,
  observedAt: number
): MonitorObservation[] {
  const parsed = HerdrAgentListSchema.parse(
    typeof value === "string" ? JSON.parse(value) : value
  );
  return parsed.result.agents.map((agent) =>
    herdrObservation(agent, observedAt)
  );
}

function herdrObservation(
  agent: HerdrAgent,
  observedAt: number
): MonitorObservation {
  const tool = agentTool(agent.agent);
  const state = agent.agent_status;
  return {
    observationId: `herdr:${agent.pane_id}`,
    observedAt,
    expiresAt: observedAt + HERDR_FRESH_MS,
    offlineAt: observedAt + HERDR_OFFLINE_MS,
    sourceId: "herdr",
    sourceKind: "herdr",
    authority: "authoritative",
    confidence: "high",
    providerId: agent.agent,
    tool,
    nativeSessionId: agent.agent_session?.value,
    sourceLocalId: agent.pane_id,
    // Let richer provider inventory own the name when a native session can be
    // reconciled. Herdr only supplies a pane label for otherwise-orphaned rows.
    displayName: agent.agent_session
      ? undefined
      : `${providerLabel(agent.agent)} · ${agent.pane_id}`,
    cwd: agent.cwd,
    state,
    stateReason: `Herdr reports ${state}`,
    currentActivity: `Herdr reports ${state}`,
    attentionKind: state === "blocked" ? "stuck" : undefined,
    spawnedHere: false,
    herdrPaneId: agent.pane_id,
    revision: `${agent.revision ?? "unknown"}:${agent.state_change_seq ?? "unknown"}`,
  };
}

function agentTool(value: string): AgentTool | undefined {
  if (
    value === "claude" ||
    value === "codex" ||
    value === "cursor" ||
    value === "gemini"
  ) {
    return value;
  }
  return undefined;
}

function providerLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isMissingBinary(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    "code" in cause &&
    (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
