import type { RunBudget } from "./orchestration";
import type { SessionControlName } from "./session-capabilities";

export const STANDING_ORDER_TEMPLATE_ID = "standing-order";
export const PROVIDER_HANDOFF_TEMPLATE_ID = "provider-handoff-review";
export const PARALLEL_COMPARISON_TEMPLATE_ID = "parallel-provider-comparison";
export const FIX_THEN_TEST_TEMPLATE_ID = "fix-then-test";

export const ORCHESTRATION_TEMPLATE_IDS = [
  STANDING_ORDER_TEMPLATE_ID,
  PROVIDER_HANDOFF_TEMPLATE_ID,
  PARALLEL_COMPARISON_TEMPLATE_ID,
  FIX_THEN_TEST_TEMPLATE_ID,
] as const;

export type OrchestrationTemplateId =
  (typeof ORCHESTRATION_TEMPLATE_IDS)[number];

export type OrchestrationTemplate = {
  id: OrchestrationTemplateId;
  title: string;
  description: string;
  requiredControls: SessionControlName[];
  defaultBudget: RunBudget;
  stopRules: string[];
  promptPayloads: string[];
};

export const ORCHESTRATION_TEMPLATES: Record<
  OrchestrationTemplateId,
  OrchestrationTemplate
> = {
  [STANDING_ORDER_TEMPLATE_ID]: {
    id: STANDING_ORDER_TEMPLATE_ID,
    title: "Standing Order",
    description: "Send a recurring prompt to one provider session.",
    requiredControls: ["runStandingOrder", "send"],
    defaultBudget: {
      maxIterations: 24,
      maxConsecutiveFailures: 3,
    },
    stopRules: [
      "Complete after max iterations.",
      "Pause on unsupported control or missing session metadata.",
      "Fail after repeated retryable send failures.",
    ],
    promptPayloads: ["prompt", "intervalMs"],
  },
  [PROVIDER_HANDOFF_TEMPLATE_ID]: {
    id: PROVIDER_HANDOFF_TEMPLATE_ID,
    title: "Provider Handoff Review",
    description: "Ask a second provider to review or continue a session.",
    requiredControls: ["send"],
    defaultBudget: {
      maxIterations: 3,
      maxConsecutiveFailures: 1,
      maxRuntimeMs: 30 * 60_000,
    },
    stopRules: [
      "Pause when the target provider cannot accept a new turn.",
      "Pause when the source trace has unresolved permission or input waits.",
      "Stop after the review response is captured.",
    ],
    promptPayloads: ["sourceTraceId", "handoffPrompt"],
  },
  [PARALLEL_COMPARISON_TEMPLATE_ID]: {
    id: PARALLEL_COMPARISON_TEMPLATE_ID,
    title: "Parallel Provider Comparison",
    description: "Send the same bounded prompt to multiple providers.",
    requiredControls: ["send"],
    defaultBudget: {
      maxIterations: 4,
      maxConsecutiveFailures: 1,
      maxRuntimeMs: 45 * 60_000,
    },
    stopRules: [
      "Pause if any provider cannot be controlled through session-control.",
      "Stop after all provider responses are captured.",
      "Do not auto-rank outputs without an explicit evaluator.",
    ],
    promptPayloads: ["providerTargets", "comparisonPrompt"],
  },
  [FIX_THEN_TEST_TEMPLATE_ID]: {
    id: FIX_THEN_TEST_TEMPLATE_ID,
    title: "Fix Then Test",
    description: "Iterate on a focused task until the declared test passes.",
    requiredControls: ["send"],
    defaultBudget: {
      maxIterations: 8,
      maxConsecutiveFailures: 2,
      maxRuntimeMs: 2 * 60 * 60_000,
    },
    stopRules: [
      "Pause on permission or user-input waits.",
      "Pause on repeated failing test output without new file changes.",
      "Complete only after the declared verification command passes.",
    ],
    promptPayloads: ["taskPrompt", "verificationCommand"],
  },
};

export function orchestrationTemplate(
  id: string
): OrchestrationTemplate | undefined {
  return ORCHESTRATION_TEMPLATES[id as OrchestrationTemplateId];
}

export function defaultBudgetForTemplate(id: string): RunBudget {
  return { ...(orchestrationTemplate(id)?.defaultBudget ?? {}) };
}
