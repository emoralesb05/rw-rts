import { z } from "zod";
import { AgentToolSchema } from "@shared/schemas/common";
import {
  SessionStatusSchema,
  type ControlSessionRequest,
  type ControlSessionResponse,
} from "@shared/schemas";
import type { AgentEvent, AgentEventKind, AgentTool } from "@shared/events";
import type {
  OrchestrationProviderSession,
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
const RESULT_SUMMARY_LIMIT = 360;
const CAPTURE_EVENT_KINDS = new Set<AgentEventKind>([
  "assistant_text",
  "tool_result",
  "error",
  "session_end",
]);

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

  async ingestAgentEvent(event: AgentEvent): Promise<OrchestrationRun[]> {
    if (!CAPTURE_EVENT_KINDS.has(event.kind)) return [];
    const matches = (await this.store.listRuns())
      .flatMap((run) =>
        pendingCaptureSteps(run, event).map((step) => ({ run, step }))
      )
      .sort(
        (a, b) =>
          (a.step.startedAt ?? a.step.createdAt) -
            (b.step.startedAt ?? b.step.createdAt) ||
          a.run.createdAt - b.run.createdAt
      );
    const match = matches[0];
    if (!match) return [];
    const captured = await this.captureOneShotEvent(
      match.run,
      match.step,
      event
    );
    return captured ? [captured] : [];
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
    if (!hasRecordedProviderSession(run, params)) {
      await this.store.recordProviderSession(
        run.id,
        providerSessionForTarget(params)
      );
    }
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
    const budgetPauseReason = runtimeBudgetPauseReason(run, this.now());
    if (budgetPauseReason) {
      return this.store.pauseRunForBudget(run.id, budgetPauseReason);
    }
    return this.ensureOneShotSend({
      run,
      target: params.target,
      stepId: `${run.id}:provider-handoff-review:send`,
      stepKind: "provider-handoff-review-send",
      stepTitle: "Send provider handoff review",
      checkpointLabel: "Provider handoff review sent",
      captureKind: "provider-handoff-review-result",
      captureTitle: "Capture provider handoff review",
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
    const budgetPauseReason = runtimeBudgetPauseReason(run, this.now());
    if (budgetPauseReason) {
      return this.store.pauseRunForBudget(run.id, budgetPauseReason);
    }
    const params = parsed.data;
    let currentRun = run;
    for (const [idx, target] of params.providerTargets.entries()) {
      const result = await this.ensureOneShotSend({
        run: currentRun,
        target,
        stepId: `${run.id}:parallel-provider-comparison:${idx + 1}`,
        stepKind: "parallel-provider-comparison-send",
        stepTitle: `Send comparison prompt ${idx + 1}`,
        checkpointLabel: `Parallel comparison prompt ${idx + 1} sent`,
        captureKind: "parallel-provider-comparison-result",
        captureTitle: `Capture comparison response ${idx + 1}`,
        prompt: parallelComparisonPrompt(params),
        inputSummary: params.comparisonPrompt,
      });
      if (result?.status !== "running") return result;
      currentRun = result;
    }
    return completeIfAllCapturesFinished(this.store, currentRun);
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
    const budgetPauseReason = runtimeBudgetPauseReason(run, this.now());
    if (budgetPauseReason) {
      return this.store.pauseRunForBudget(run.id, budgetPauseReason);
    }
    return this.ensureOneShotSend({
      run,
      target: params.target,
      stepId: `${run.id}:fix-then-test:send`,
      stepKind: "fix-then-test-send",
      stepTitle: "Send fix-then-test prompt",
      checkpointLabel: "Fix-then-test prompt sent",
      captureKind: "fix-then-test-result",
      captureTitle: "Capture fix-then-test result",
      prompt: fixThenTestPrompt(params),
      inputSummary: `${params.taskPrompt}\n${params.verificationCommand}`,
    });
  }

  private async ensureOneShotSend(options: {
    run: OrchestrationRun;
    target: ProviderTarget;
    stepId: string;
    stepKind: string;
    stepTitle: string;
    checkpointLabel: string;
    captureKind: string;
    captureTitle: string;
    prompt: string;
    inputSummary: string;
  }): Promise<OrchestrationRun | undefined> {
    if (!hasRecordedProviderSession(options.run, options.target)) {
      await this.store.recordProviderSession(
        options.run.id,
        providerSessionForTarget(options.target)
      );
    }
    const captureId = captureStepId(options.stepId);
    const existingSend = options.run.steps.find(
      (step) => step.id === options.stepId
    );
    if (existingSend) {
      if (
        existingSend.status === "completed" &&
        !options.run.steps.some((step) => step.id === captureId)
      ) {
        return this.store.upsertStep(
          options.run.id,
          oneShotCaptureStep({
            id: captureId,
            kind: options.captureKind,
            title: options.captureTitle,
            target: options.target,
            now: this.now(),
          })
        );
      }
      return options.run;
    }

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
      traceId: stableTraceId(options.target.tool, options.target.sessionId),
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
    return this.store.upsertStep(
      options.run.id,
      oneShotCaptureStep({
        id: captureId,
        kind: options.captureKind,
        title: options.captureTitle,
        target: options.target,
        now,
      })
    );
  }

  private async captureOneShotEvent(
    run: OrchestrationRun,
    step: OrchestrationStep,
    event: AgentEvent
  ): Promise<OrchestrationRun | undefined> {
    const now = this.now();
    const capture = capturedOutput(event);
    const failed = event.kind === "error";
    const completed =
      event.kind === "assistant_text" || event.kind === "session_end";
    const nextStep: OrchestrationStep = {
      ...step,
      status: failed ? "failed" : completed ? "completed" : "running",
      updatedAt: now,
      endedAt: failed || completed ? now : step.endedAt,
      outputSummary: capture.summary,
      error: failed ? capture.summary : step.error,
    };
    await this.store.upsertStep(run.id, nextStep);
    await this.store.addCheckpoint(run.id, {
      id: captureCheckpointId(run, step),
      label: capture.label,
      createdAt: now,
      stepId: step.id,
      traceId: stableTraceId(event.tool, event.sessionId),
      state: {
        eventKind: event.kind,
        summary: capture.summary,
        sessionId: event.sessionId,
        tool: event.tool,
      },
    });

    const latest = await this.store.getRun(run.id);
    if (!latest) return undefined;
    if (failed) {
      return this.store.pauseRun(
        run.id,
        "Provider emitted an error while the run was waiting for output."
      );
    }
    if (!completed) return latest;
    return completeIfAllCapturesFinished(this.store, latest);
  }

  private isDue(run: OrchestrationRun): boolean {
    if (run.status !== "running") return false;
    if (run.template !== STANDING_ORDER_TEMPLATE_ID) {
      if (!isOneShotTemplate(run.template)) return false;
      return (
        run.steps.length === 0 ||
        hasPendingCaptureStep(run) ||
        Boolean(runtimeBudgetPauseReason(run, this.now()))
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
    traceId: stableTraceId(options.target.tool, options.target.sessionId),
    inputSummary: options.inputSummary,
    outputSummary: options.result.ok ? "sent" : undefined,
    error: options.result.ok
      ? undefined
      : (options.result.reason ?? "Send failed."),
  };
}

function oneShotCaptureStep(options: {
  id: string;
  kind: string;
  title: string;
  target: ProviderTarget;
  now: number;
}): OrchestrationStep {
  return {
    id: options.id,
    title: options.title,
    kind: options.kind,
    status: "running",
    attempts: 1,
    createdAt: options.now,
    updatedAt: options.now,
    startedAt: options.now,
    providerSessionId: options.target.sessionId,
    traceId: stableTraceId(options.target.tool, options.target.sessionId),
    inputSummary: "Waiting for provider output.",
  };
}

function pendingCaptureSteps(
  run: OrchestrationRun,
  event: AgentEvent
): OrchestrationStep[] {
  if (run.status !== "running" || !isOneShotTemplate(run.template)) return [];
  return oneShotCaptureSteps(run).filter((step) => {
    if (step.status !== "running") return false;
    if (step.providerSessionId !== event.sessionId) return false;
    if (
      step.traceId &&
      step.traceId !== stableTraceId(event.tool, event.sessionId)
    ) {
      return false;
    }
    const startedAt = step.startedAt ?? step.createdAt;
    return event.timestamp >= startedAt;
  });
}

function oneShotCaptureSteps(run: OrchestrationRun): OrchestrationStep[] {
  return run.steps.filter((step) => step.kind.endsWith("-result"));
}

function hasPendingCaptureStep(run: OrchestrationRun): boolean {
  return oneShotCaptureSteps(run).some((step) => step.status === "running");
}

async function completeIfAllCapturesFinished(
  store: LocalOrchestrationStore,
  run: OrchestrationRun
): Promise<OrchestrationRun | undefined> {
  const latest = (await store.getRun(run.id)) ?? run;
  const captureSteps = oneShotCaptureSteps(latest);
  if (
    captureSteps.length > 0 &&
    captureSteps.every((step) => step.status === "completed")
  ) {
    return store.completeRun(latest.id);
  }
  return latest;
}

function isOneShotTemplate(template: string): boolean {
  return (
    template === PROVIDER_HANDOFF_TEMPLATE_ID ||
    template === PARALLEL_COMPARISON_TEMPLATE_ID ||
    template === FIX_THEN_TEST_TEMPLATE_ID
  );
}

function providerSessionForTarget(
  target: Pick<ProviderTarget, "unitId" | "sessionId" | "tool" | "cwd">
): OrchestrationProviderSession {
  return {
    unitId: target.unitId,
    sessionId: target.sessionId,
    tool: target.tool,
    cwd: target.cwd,
    traceId: stableTraceId(target.tool, target.sessionId),
  };
}

function hasRecordedProviderSession(
  run: OrchestrationRun,
  target: Pick<ProviderTarget, "sessionId" | "tool">
): boolean {
  const traceId = stableTraceId(target.tool, target.sessionId);
  return (
    run.providerSessions.some(
      (session) =>
        session.tool === target.tool && session.sessionId === target.sessionId
    ) && run.traceIds.includes(traceId)
  );
}

function stableTraceId(tool: AgentTool, sessionId: string): string {
  return `trace:${tool}:${sessionId}`;
}

function captureStepId(sendStepId: string): string {
  return `${sendStepId}:result`;
}

function captureCheckpointId(
  run: OrchestrationRun,
  step: OrchestrationStep
): string {
  const prefix = `${step.id}:capture:`;
  const count =
    run.checkpoints.filter((checkpoint) => checkpoint.id.startsWith(prefix))
      .length + 1;
  return `${prefix}${count}`;
}

function capturedOutput(event: AgentEvent): { label: string; summary: string } {
  if (event.kind === "assistant_text") {
    return {
      label: "Provider response captured",
      summary: compactSummary(event.payload.text ?? "Assistant responded."),
    };
  }
  if (event.kind === "tool_result") {
    return {
      label: "Provider tool result captured",
      summary: compactSummary(
        event.payload.output ?? event.payload.text ?? "Tool result emitted."
      ),
    };
  }
  if (event.kind === "error") {
    return {
      label: "Provider error captured",
      summary: compactSummary(
        event.payload.error ?? event.payload.text ?? "Provider emitted error."
      ),
    };
  }
  return {
    label: "Provider session ended",
    summary: compactSummary(event.payload.text ?? "Provider session ended."),
  };
}

function compactSummary(value: unknown): string {
  const text = serializeSummary(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > RESULT_SUMMARY_LIMIT
    ? `${text.slice(0, RESULT_SUMMARY_LIMIT - 1)}…`
    : text;
}

function serializeSummary(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
