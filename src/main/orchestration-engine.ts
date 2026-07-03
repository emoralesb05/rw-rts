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
import {
  defaultBudgetForTemplate,
  FIX_THEN_TEST_TEMPLATE_ID,
  PARALLEL_COMPARISON_TEMPLATE_ID,
  PROVIDER_HANDOFF_TEMPLATE_ID,
  STANDING_ORDER_TEMPLATE_ID,
} from "@shared/orchestration-templates";
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

const ProviderTargetSchema = z.object({
  unitId: z.string().min(1),
  sessionId: z.string().min(1),
  tool: AgentToolSchema,
  cwd: z.string().min(1),
  status: SessionStatusSchema.optional(),
});
type ProviderTarget = z.infer<typeof ProviderTargetSchema>;

const ProviderHandoffRunParamsSchema = z.object({
  target: ProviderTargetSchema,
  sourceTraceId: z.string().min(1).optional(),
  handoffPrompt: z.string().min(1),
});
type ProviderHandoffRunParams = z.infer<typeof ProviderHandoffRunParamsSchema>;

const ParallelComparisonRunParamsSchema = z.object({
  providerTargets: z.array(ProviderTargetSchema).min(1),
  comparisonPrompt: z.string().min(1),
});
type ParallelComparisonRunParams = z.infer<
  typeof ParallelComparisonRunParamsSchema
>;

const FixThenTestRunParamsSchema = z.object({
  target: ProviderTargetSchema,
  taskPrompt: z.string().min(1),
  verificationCommand: z.string().min(1),
});
type FixThenTestRunParams = z.infer<typeof FixThenTestRunParamsSchema>;

const DEFAULT_POLL_MS = 1000;
const STANDING_ORDER_DEFAULT_BUDGET = defaultBudgetForTemplate(
  STANDING_ORDER_TEMPLATE_ID
);
const DEFAULT_MAX_ITERATIONS =
  STANDING_ORDER_DEFAULT_BUDGET.maxIterations ?? 24;
const DEFAULT_MAX_CONSECUTIVE_FAILURES =
  STANDING_ORDER_DEFAULT_BUDGET.maxConsecutiveFailures ?? 3;

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
    switch (run.template) {
      case STANDING_ORDER_TEMPLATE_ID:
        return this.tickStandingOrder(run);
      case PROVIDER_HANDOFF_TEMPLATE_ID:
        return this.tickProviderHandoff(run);
      case PARALLEL_COMPARISON_TEMPLATE_ID:
        return this.tickParallelComparison(run);
      case FIX_THEN_TEST_TEMPLATE_ID:
        return this.tickFixThenTest(run);
      default:
        return run;
    }
  }

  private async tickStandingOrder(
    run: OrchestrationRun
  ): Promise<OrchestrationRun | undefined> {
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

  private async tickProviderHandoff(
    run: OrchestrationRun
  ): Promise<OrchestrationRun | undefined> {
    const parsed = ProviderHandoffRunParamsSchema.safeParse(run.params ?? {});
    if (!parsed.success) {
      return this.store.pauseRun(
        run.id,
        "Provider handoff review run is missing a target provider session."
      );
    }
    const params = parsed.data;
    return this.tickOneShotSend({
      run,
      target: params.target,
      stepId: `${run.id}:provider-handoff-review:send`,
      stepKind: "provider-handoff-review-send",
      stepTitle: "Send provider handoff review",
      checkpointLabel: "Provider handoff review sent",
      prompt: providerHandoffPrompt(params),
      inputSummary: params.handoffPrompt,
    });
  }

  private async tickParallelComparison(
    run: OrchestrationRun
  ): Promise<OrchestrationRun | undefined> {
    const parsed = ParallelComparisonRunParamsSchema.safeParse(
      run.params ?? {}
    );
    if (!parsed.success) {
      return this.store.pauseRun(
        run.id,
        "Parallel provider comparison run is missing provider targets."
      );
    }
    const params = parsed.data;
    for (const [idx, target] of params.providerTargets.entries()) {
      const result = await this.tickOneShotSend({
        run,
        target,
        stepId: `${run.id}:parallel-provider-comparison:${idx + 1}`,
        stepKind: "parallel-provider-comparison-send",
        stepTitle: `Send comparison prompt ${idx + 1}`,
        checkpointLabel: `Parallel comparison prompt ${idx + 1} sent`,
        prompt: parallelComparisonPrompt(params),
        inputSummary: params.comparisonPrompt,
        completeOnSuccess: false,
      });
      if (result?.status !== "running") return result;
    }
    return this.store.completeRun(run.id);
  }

  private async tickFixThenTest(
    run: OrchestrationRun
  ): Promise<OrchestrationRun | undefined> {
    const parsed = FixThenTestRunParamsSchema.safeParse(run.params ?? {});
    if (!parsed.success) {
      return this.store.pauseRun(
        run.id,
        "Fix-then-test run is missing a target provider session."
      );
    }
    const params = parsed.data;
    return this.tickOneShotSend({
      run,
      target: params.target,
      stepId: `${run.id}:fix-then-test:send`,
      stepKind: "fix-then-test-send",
      stepTitle: "Send fix-then-test prompt",
      checkpointLabel: "Fix-then-test prompt sent",
      prompt: fixThenTestPrompt(params),
      inputSummary: `${params.taskPrompt}\n${params.verificationCommand}`,
    });
  }

  private async tickOneShotSend(options: {
    run: OrchestrationRun;
    target: ProviderTarget;
    stepId: string;
    stepKind: string;
    stepTitle: string;
    checkpointLabel: string;
    prompt: string;
    inputSummary: string;
    completeOnSuccess?: boolean;
  }): Promise<OrchestrationRun | undefined> {
    const result = await this.sendProviderControl(
      options.target,
      options.prompt,
      `${options.stepKind} provider control failed.`
    );
    const now = this.now();
    const step = oneShotStep({
      run: options.run,
      target: options.target,
      result,
      now,
      id: options.stepId,
      kind: options.stepKind,
      title: options.stepTitle,
      inputSummary: options.inputSummary,
    });
    await this.store.upsertStep(options.run.id, step);
    await this.store.addCheckpoint(options.run.id, {
      id: `${step.id}:checkpoint`,
      label: result.ok
        ? options.checkpointLabel
        : `${options.stepTitle} failed`,
      createdAt: now,
      stepId: step.id,
      state: {
        ok: result.ok,
        reason: result.reason,
      },
    });

    const latest = await this.store.getRun(options.run.id);
    if (!latest) return undefined;
    if (!result.ok) {
      return this.store.pauseRun(
        options.run.id,
        result.reason ?? "Provider control failed."
      );
    }
    if (options.completeOnSuccess === false) return latest;
    return this.store.completeRun(options.run.id);
  }

  private isDue(run: OrchestrationRun): boolean {
    if (run.status !== "running") return false;
    if (run.template !== STANDING_ORDER_TEMPLATE_ID) {
      return (
        (run.template === PROVIDER_HANDOFF_TEMPLATE_ID ||
          run.template === PARALLEL_COMPARISON_TEMPLATE_ID ||
          run.template === FIX_THEN_TEST_TEMPLATE_ID) &&
        run.steps.length === 0
      );
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
    return this.sendProviderControl(
      params,
      standingOrderPrompt(params.prompt, iteration, maxIterations),
      "Standing order provider control failed."
    );
  }

  private async sendProviderControl(
    target: ProviderTarget,
    prompt: string,
    fallbackReason: string
  ): Promise<ControlSessionResponse> {
    try {
      return await this.controlSession({
        action: "send",
        unitId: target.unitId,
        sessionId: target.sessionId,
        tool: target.tool,
        cwd: target.cwd,
        status: target.status,
        prompt,
      });
    } catch (err) {
      return {
        action: "send",
        ok: false,
        reason: err instanceof Error ? err.message : fallbackReason,
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

function oneShotStep(options: {
  run: OrchestrationRun;
  target: ProviderTarget;
  result: ControlSessionResponse;
  now: number;
  id: string;
  kind: string;
  title: string;
  inputSummary: string;
}): OrchestrationStep {
  return {
    id: options.id,
    title: options.title,
    kind: options.kind,
    status: options.result.ok ? "completed" : "failed",
    attempts: 1,
    createdAt: options.now,
    updatedAt: options.now,
    startedAt: options.now,
    endedAt: options.now,
    providerSessionId: options.target.sessionId,
    inputSummary: options.inputSummary,
    outputSummary: options.result.ok ? "sent" : undefined,
    error: options.result.ok
      ? undefined
      : (options.result.reason ?? "Send failed."),
  };
}

function providerHandoffPrompt(params: ProviderHandoffRunParams): string {
  const source = params.sourceTraceId
    ? `\n\nSource trace: ${params.sourceTraceId}`
    : "";
  return `[Provider Handoff Review]\n\n${params.handoffPrompt}${source}`;
}

function parallelComparisonPrompt(params: ParallelComparisonRunParams): string {
  return `[Parallel Provider Comparison]\n\n${params.comparisonPrompt}`;
}

function fixThenTestPrompt(params: FixThenTestRunParams): string {
  return `[Fix Then Test]\n\nTask:\n${params.taskPrompt}\n\nVerification:\n${params.verificationCommand}`;
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
