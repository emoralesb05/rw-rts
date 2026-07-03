import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  EMPTY_ORCHESTRATION_STORE,
  OrchestrationRunSchema,
  OrchestrationStoreFileSchema,
  type OrchestrationCheckpoint,
  type OrchestrationEventKind,
  type OrchestrationRun,
  type OrchestrationRunEvent,
  type OrchestrationRunStatus,
  type OrchestrationStep,
  type OrchestrationStoreFile,
  type RunBudget,
} from "@shared/orchestration";

export type OrchestrationStoreOptions = {
  rootDir?: string;
  now?: () => number;
  idFactory?: () => string;
};

export type CreateOrchestrationRunInput = {
  id?: string;
  template: string;
  title: string;
  params?: Record<string, unknown>;
  cwd?: string;
  repoRoot?: string;
  budget?: RunBudget;
  status?: Extract<OrchestrationRunStatus, "queued" | "running" | "paused">;
};

export function defaultOrchestrationRoot(): string {
  return join(homedir(), ".realmkeeper", "orchestration");
}

export function orchestrationFile(rootDir: string): string {
  return join(rootDir, "runs.json");
}

export class LocalOrchestrationStore {
  private readonly rootDir: string;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private cache: OrchestrationStoreFile | null = null;

  constructor(options: OrchestrationStoreOptions = {}) {
    this.rootDir = options.rootDir ?? defaultOrchestrationRoot();
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async listRuns(): Promise<OrchestrationRun[]> {
    const file = await this.load();
    return Object.values(file.runs).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getRun(id: string): Promise<OrchestrationRun | undefined> {
    const file = await this.load();
    return file.runs[id];
  }

  async createRun(
    input: CreateOrchestrationRunInput
  ): Promise<OrchestrationRun> {
    const file = await this.load();
    const now = this.now();
    const id = input.id ?? this.idFactory();
    const status = input.status ?? "queued";
    const run = OrchestrationRunSchema.parse({
      id,
      template: input.template,
      title: input.title,
      params: input.params,
      status,
      cwd: input.cwd,
      repoRoot: input.repoRoot,
      createdAt: now,
      updatedAt: now,
      startedAt: status === "running" ? now : undefined,
      pauseReason: status === "paused" ? "Created paused." : undefined,
      providerSessions: [],
      traceIds: [],
      permissionRequestIds: [],
      userInputRequestIds: [],
      steps: [],
      checkpoints: [],
      budget: input.budget ?? {},
      events: [
        this.event(
          status === "running"
            ? "started"
            : status === "paused"
              ? "paused"
              : "created",
          now,
          status === "paused" ? "Created paused." : undefined
        ),
      ],
    });
    file.runs[id] = run;
    await this.persist();
    return run;
  }

  async upsertStep(
    runId: string,
    step: OrchestrationStep
  ): Promise<OrchestrationRun> {
    return this.updateRun(runId, (run, now) => {
      const existing = run.steps.findIndex((item) => item.id === step.id);
      const nextStep = { ...step, updatedAt: now };
      const steps =
        existing >= 0
          ? run.steps.map((item, idx) => (idx === existing ? nextStep : item))
          : [...run.steps, nextStep];
      return {
        ...run,
        steps,
        updatedAt: now,
        events: [...run.events, this.event("step_updated", now, step.title)],
      };
    });
  }

  async addCheckpoint(
    runId: string,
    checkpoint: OrchestrationCheckpoint
  ): Promise<OrchestrationRun> {
    return this.updateRun(runId, (run, now) => ({
      ...run,
      checkpoints: [...run.checkpoints, checkpoint],
      lastCheckpointId: checkpoint.id,
      updatedAt: now,
      events: [
        ...run.events,
        this.event("checkpoint", now, checkpoint.label, {
          checkpointId: checkpoint.id,
          stepId: checkpoint.stepId,
        }),
      ],
    }));
  }

  async startRun(runId: string): Promise<OrchestrationRun> {
    return this.transition(runId, "running", "started");
  }

  async pauseRun(
    runId: string,
    reason = "Paused."
  ): Promise<OrchestrationRun> {
    return this.transition(runId, "paused", "paused", reason);
  }

  async resumeRun(runId: string): Promise<OrchestrationRun> {
    return this.transition(runId, "running", "resumed");
  }

  async stopRun(
    runId: string,
    reason = "Stopped."
  ): Promise<OrchestrationRun> {
    return this.transition(runId, "stopped", "stopped", reason);
  }

  async completeRun(runId: string): Promise<OrchestrationRun> {
    return this.transition(runId, "completed", "completed");
  }

  async failRun(runId: string, reason: string): Promise<OrchestrationRun> {
    return this.transition(runId, "failed", "failed", reason);
  }

  async recoverAfterRestart(): Promise<OrchestrationRun[]> {
    const file = await this.load();
    const recovered: OrchestrationRun[] = [];
    for (const run of Object.values(file.runs)) {
      if (run.status !== "running") continue;
      const now = this.now();
      const reason =
        "Paused after restart; validate checkpoint and provider capability before resuming.";
      const next = OrchestrationRunSchema.parse({
        ...run,
        status: "paused",
        pauseReason: reason,
        updatedAt: now,
        events: [...run.events, this.event("recovered", now, reason)],
      });
      file.runs[run.id] = next;
      recovered.push(next);
    }
    if (recovered.length > 0) await this.persist();
    return recovered;
  }

  async flush(): Promise<void> {
    if (!this.cache) return;
    await this.persist();
  }

  private async transition(
    runId: string,
    status: OrchestrationRunStatus,
    eventKind: OrchestrationEventKind,
    message?: string
  ): Promise<OrchestrationRun> {
    return this.updateRun(runId, (run, now) => ({
      ...run,
      status,
      updatedAt: now,
      startedAt: run.startedAt ?? (status === "running" ? now : undefined),
      endedAt:
        status === "completed" || status === "failed" || status === "stopped"
          ? now
          : run.endedAt,
      pauseReason: status === "paused" ? message : undefined,
      failureReason: status === "failed" ? message : undefined,
      events: [...run.events, this.event(eventKind, now, message)],
    }));
  }

  private async updateRun(
    runId: string,
    update: (run: OrchestrationRun, now: number) => OrchestrationRun
  ): Promise<OrchestrationRun> {
    const file = await this.load();
    const current = file.runs[runId];
    if (!current) throw new Error(`Unknown orchestration run ${runId}`);
    const next = OrchestrationRunSchema.parse(update(current, this.now()));
    file.runs[runId] = next;
    await this.persist();
    return next;
  }

  private event(
    kind: OrchestrationEventKind,
    at: number,
    message?: string,
    refs: { stepId?: string; checkpointId?: string } = {}
  ): OrchestrationRunEvent {
    return {
      id: this.idFactory(),
      kind,
      at,
      message,
      ...refs,
    };
  }

  private async load(): Promise<OrchestrationStoreFile> {
    if (this.cache) return this.cache;
    const path = orchestrationFile(this.rootDir);
    const raw = await readFile(path, "utf8").catch(
      (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return "";
        throw err;
      }
    );
    if (!raw) {
      this.cache = { ...EMPTY_ORCHESTRATION_STORE, runs: {} };
      return this.cache;
    }
    try {
      this.cache = migrateStoreFile(JSON.parse(raw));
      return this.cache;
    } catch {
      this.cache = { ...EMPTY_ORCHESTRATION_STORE, runs: {} };
      return this.cache;
    }
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    const path = orchestrationFile(this.rootDir);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(this.cache, null, 2) + "\n", "utf8");
  }
}

function migrateStoreFile(value: unknown): OrchestrationStoreFile {
  const current = OrchestrationStoreFileSchema.safeParse(value);
  if (current.success) return current.data;

  if (!value || typeof value !== "object") {
    return { ...EMPTY_ORCHESTRATION_STORE, runs: {} };
  }
  const raw = value as { runs?: unknown };
  const runs = Array.isArray(raw.runs)
    ? Object.fromEntries(
        raw.runs
          .map((run) => OrchestrationRunSchema.safeParse(run))
          .filter((result) => result.success)
          .map((result) => [result.data.id, result.data])
      )
    : {};
  return OrchestrationStoreFileSchema.parse({
    schemaVersion: 1,
    runs,
  });
}
