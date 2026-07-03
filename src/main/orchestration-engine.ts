import { z } from "zod";
import { AgentToolSchema } from "@shared/schemas/common";
import {
  SessionStatusSchema,
  type ControlSessionRequest,
  type ControlSessionResponse,
} from "@shared/schemas";
import type {
  OrchestrationRun,
  OrchestrationStep,
} from "@shared/orchestration";
import type { LocalOrchestrationStore } from "./orchestration-store";

export type OrchestrationControlSession = (
  req: ControlSessionRequest
) => ControlSessionResponse | Promise<ControlSessionResponse>;

export type MainOrchestrationEngineOptions = {
  store: LocalOrchestrationStore;
  controlSession: OrchestrationControlSession;
  now?: () => number;
  pollMs?: number;
};

export const StandingOrderRunParamsSchema = z.object({
  unitId: z.string().min(1),
  sessionId: z.string().min(1),
  tool: AgentToolSchema,
  cwd: z.string().min(1),
  status: SessionStatusSchema.optional(),
  prompt: z.string().min(1),
  intervalMs: z.number().nonnegative(),
});
export type StandingOrderRunParams = z.infer<
  typeof StandingOrderRunParamsSchema
>;

const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_ITERATIONS = 24;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

export class MainOrchestrationEngine {
  private readonly store: LocalOrchestrationStore;
  private readonly controlSession: OrchestrationControlSession;
  private readonly now: () => number;
  private readonly pollMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(options: MainOrchestrationEngineOptions) {
    this.store = options.store;
    this.controlSession = options.controlSession;
    this.now = options.now ?? Date.now;
    this.pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tickDueRuns(), this.pollMs);
    void this.tickDueRuns();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async tickDueRuns(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const runs = await this.store.listRuns();
      for (const run of runs) {
        if (!this.isDue(run)) continue;
        await this.tickOnce(run.id);
      }
    } finally {
      this.ticking = false;
    }
  }

  async tickOnce(runId: string): Promise<OrchestrationRun | undefined> {
    const run = await this.store.getRun(runId);
    if (!run || run.status !== "running") return run;
    if (run.template !== "standing-order") return run;

    const budgetPauseReason = runtimeBudgetPauseReason(run, this.now());
    if (budgetPauseReason) {
      return this.store.pauseRunForBudget(run.id, budgetPauseReason);
    }

    const parsed = StandingOrderRunParamsSchema.safeParse(run.params ?? {});
    if (!parsed.success) {
      return this.store.pauseRun(
        run.id,
        "Standing-order run is missing required provider session params."
      );
    }

    const params = parsed.data;
    const iteration = standingOrderTickCount(run) + 1;
    const maxIterations = run.budget.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const result = await this.sendStandingOrderControl(
      params,
      iteration,
      maxIterations
    );
    const now = this.now();
    const ok = result.ok;
    const step = standingOrderStep(run, iteration, now, params, result);
    await this.store.upsertStep(run.id, step);
    await this.store.addCheckpoint(run.id, {
      id: `${step.id}:checkpoint`,
      label: ok
        ? `Standing order iteration ${iteration} sent`
        : `Standing order iteration ${iteration} failed`,
      createdAt: now,
      stepId: step.id,
      state: {
        ok,
        reason: result.reason,
        iteration,
      },
    });

    const latest = await this.store.getRun(run.id);
    if (!latest) return undefined;
    if (!ok) {
      if (shouldPauseForControlFailure(result)) {
        return this.store.pauseRun(
          run.id,
          result.reason ?? "Standing order control is unavailable."
        );
      }
      const failures = consecutiveStandingOrderFailures(run) + 1;
      const maxFailures =
        run.budget.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
      if (failures >= maxFailures) {
        return this.store.failRun(
          run.id,
          result.reason ?? "Standing order failed repeatedly."
        );
      }
      return latest;
    }
    if (iteration >= maxIterations) return this.store.completeRun(run.id);
    return latest;
  }

  private isDue(run: OrchestrationRun): boolean {
    if (run.status !== "running" || run.template !== "standing-order") {
      return false;
    }
    const parsed = StandingOrderRunParamsSchema.safeParse(run.params ?? {});
    if (!parsed.success) return true;
    const lastTickAt = lastStandingOrderTickAt(run);
    if (!lastTickAt) return true;
    return this.now() - lastTickAt >= parsed.data.intervalMs;
  }

  private async sendStandingOrderControl(
    params: StandingOrderRunParams,
    iteration: number,
    maxIterations: number
  ): Promise<ControlSessionResponse> {
    try {
      return await this.controlSession({
        action: "send",
        unitId: params.unitId,
        sessionId: params.sessionId,
        tool: params.tool,
        cwd: params.cwd,
        status: params.status,
        prompt: standingOrderPrompt(params.prompt, iteration, maxIterations),
      });
    } catch (err) {
      return {
        action: "send",
        ok: false,
        reason:
          err instanceof Error
            ? err.message
            : "Standing order provider control failed.",
        reasonCode: "provider_error",
      };
    }
  }
}

function standingOrderPrompt(
  prompt: string,
  iteration: number,
  maxIterations: number
): string {
  return `[Standing Order - iteration ${iteration}/${maxIterations}]\n\n${prompt}`;
}

function standingOrderStep(
  run: OrchestrationRun,
  iteration: number,
  now: number,
  params: StandingOrderRunParams,
  result: ControlSessionResponse
): OrchestrationStep {
  return {
    id: `${run.id}:standing-order:${iteration}`,
    title: `Standing order iteration ${iteration}`,
    kind: "standing-order-tick",
    status: result.ok ? "completed" : "failed",
    attempts: 1,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    endedAt: now,
    providerSessionId: params.sessionId,
    inputSummary: params.prompt,
    outputSummary: result.ok ? "sent" : undefined,
    error: result.ok ? undefined : (result.reason ?? "Send failed."),
  };
}

function standingOrderSteps(run: OrchestrationRun): OrchestrationStep[] {
  return run.steps
    .filter((step) => step.kind === "standing-order-tick")
    .sort((a, b) => (a.endedAt ?? a.updatedAt) - (b.endedAt ?? b.updatedAt));
}

function standingOrderTickCount(run: OrchestrationRun): number {
  return standingOrderSteps(run).length;
}

function lastStandingOrderTickAt(run: OrchestrationRun): number | undefined {
  const steps = standingOrderSteps(run);
  const last = steps[steps.length - 1];
  return last?.endedAt ?? last?.updatedAt;
}

function consecutiveStandingOrderFailures(run: OrchestrationRun): number {
  let count = 0;
  for (const step of standingOrderSteps(run).reverse()) {
    if (step.status !== "failed") break;
    count++;
  }
  return count;
}

function shouldPauseForControlFailure(result: ControlSessionResponse): boolean {
  return (
    result.reasonCode === "capability_unavailable" ||
    result.reasonCode === "missing_session_metadata" ||
    result.reasonCode === "invalid_request" ||
    result.reasonCode === "provider_error"
  );
}

function runtimeBudgetPauseReason(run: OrchestrationRun, now: number): string {
  const maxRuntimeMs = run.budget.maxRuntimeMs;
  if (maxRuntimeMs === undefined) return "";
  const startedAt = run.startedAt ?? run.createdAt;
  const elapsedMs = Math.max(0, now - startedAt);
  if (elapsedMs < maxRuntimeMs) return "";
  return `Run exceeded runtime budget (${elapsedMs}ms/${maxRuntimeMs}ms).`;
}
