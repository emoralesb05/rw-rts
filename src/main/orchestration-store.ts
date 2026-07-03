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
  type OrchestrationProviderSession,
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
  onRunEvent?: (run: OrchestrationRun, event: OrchestrationRunEvent) => void;
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
  private readonly onRunEvent:
    | ((run: OrchestrationRun, event: OrchestrationRunEvent) => void)
    | undefined;
  private cache: OrchestrationStoreFile | null = null;

  constructor(options: OrchestrationStoreOptions = {}) {
    this.rootDir = options.rootDir ?? defaultOrchestrationRoot();
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? randomUUID;
    this.onRunEvent = options.onRunEvent;
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
    const initialEvent = this.event(
      status === "running"
        ? "started"
        : status === "paused"
          ? "paused"
          : "created",
      now,
      status === "paused" ? "Created paused." : undefined
    );
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
      events: [initialEvent],
    });
    file.runs[id] = run;
    await this.persist();
    this.emitRunEvent(run, initialEvent);
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

  async recordProviderSession(
    runId: string,
    session: OrchestrationProviderSession
  ): Promise<OrchestrationRun> {
    return this.updateRun(runId, (run, now) => {
      const providerSessions = upsertProviderSession(
        run.providerSessions,
        session
      );
      return {
        ...run,
        providerSessions,
        traceIds: session.traceId
          ? uniqueStrings([...run.traceIds, session.traceId])
          : run.traceIds,
        updatedAt: now,
      };
    });
  }

  async recordRequestIds(
    runId: string,
    refs: { permissionRequestId?: string; userInputRequestId?: string }
  ): Promise<OrchestrationRun> {
    return this.updateRun(runId, (run, now) => ({
      ...run,
      permissionRequestIds: refs.permissionRequestId
        ? uniqueStrings([...run.permissionRequestIds, refs.permissionRequestId])
        : run.permissionRequestIds,
      userInputRequestIds: refs.userInputRequestId
        ? uniqueStrings([...run.userInputRequestIds, refs.userInputRequestId])
        : run.userInputRequestIds,
      updatedAt: now,
    }));
  }

  async startRun(runId: string): Promise<OrchestrationRun> {
    return this.transition(runId, "running", "started");
  }

  async pauseRun(runId: string, reason = "Paused."): Promise<OrchestrationRun> {
    return this.transition(runId, "paused", "paused", reason);
  }

  async resumeRun(runId: string): Promise<OrchestrationRun> {
    return this.transition(runId, "running", "resumed");
  }

  async stopRun(runId: string, reason = "Stopped."): Promise<OrchestrationRun> {
    return this.transition(runId, "stopped", "stopped", reason);
  }

  async completeRun(runId: string): Promise<OrchestrationRun> {
    return this.transition(runId, "completed", "completed");
  }

  async failRun(runId: string, reason: string): Promise<OrchestrationRun> {
    return this.transition(runId, "failed", "failed", reason);
  }

  async pauseRunForBudget(
    runId: string,
    reason: string
  ): Promise<OrchestrationRun> {
    return this.updateRun(runId, (run, now) => ({
      ...run,
      status: "paused",
      pauseReason: reason,
      updatedAt: now,
      events: [...run.events, this.event("budget_exceeded", now, reason)],
    }));
  }

  async recoverAfterRestart(): Promise<OrchestrationRun[]> {
    const file = await this.load();
    const recovered: OrchestrationRun[] = [];
    const emitted: {
      run: OrchestrationRun;
      event: OrchestrationRunEvent;
    }[] = [];
    for (const run of Object.values(file.runs)) {
      if (run.status !== "running") continue;
      const now = this.now();
      const reason =
        "Paused after restart; validate checkpoint and provider capability before resuming.";
      const event = this.event("recovered", now, reason);
      const next = OrchestrationRunSchema.parse({
        ...run,
        status: "paused",
        pauseReason: reason,
        updatedAt: now,
        events: [...run.events, event],
      });
      file.runs[run.id] = next;
      recovered.push(next);
      emitted.push({ run: next, event });
    }
    if (recovered.length > 0) await this.persist();
    for (const item of emitted) this.emitRunEvent(item.run, item.event);
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
    const priorEventIds = new Set(current.events.map((event) => event.id));
    const next = OrchestrationRunSchema.parse(update(current, this.now()));
    file.runs[runId] = next;
    await this.persist();
    for (const event of next.events) {
      if (!priorEventIds.has(event.id)) this.emitRunEvent(next, event);
    }
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

  private emitRunEvent(
    run: OrchestrationRun,
    event: OrchestrationRunEvent
  ): void {
    try {
      this.onRunEvent?.(run, event);
    } catch (err) {
      console.warn("[realmkeeper] orchestration event listener failed", err);
    }
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

function upsertProviderSession(
  sessions: OrchestrationProviderSession[],
  next: OrchestrationProviderSession
): OrchestrationProviderSession[] {
  const existing = sessions.findIndex(
    (session) =>
      session.tool === next.tool && session.sessionId === next.sessionId
  );
  if (existing < 0) return [...sessions, next];
  return sessions.map((session, idx) =>
    idx === existing ? { ...session, ...next } : session
  );
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
