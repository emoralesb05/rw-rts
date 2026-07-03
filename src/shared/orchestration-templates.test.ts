import { describe, expect, it } from "vitest";
import {
  defaultBudgetForTemplate,
  ORCHESTRATION_TEMPLATE_IDS,
  ORCHESTRATION_TEMPLATES,
  STANDING_ORDER_TEMPLATE_ID,
} from "./orchestration-templates";

describe("orchestration templates", () => {
  it("declares constrained templates with controls, budgets, and stop rules", () => {
    for (const id of ORCHESTRATION_TEMPLATE_IDS) {
      expect(ORCHESTRATION_TEMPLATES[id]).toMatchObject({
        id,
        title: expect.any(String),
        description: expect.any(String),
        requiredControls: expect.arrayContaining(["send"]),
        defaultBudget: expect.any(Object),
        stopRules: expect.any(Array),
        promptPayloads: expect.any(Array),
      });
      expect(ORCHESTRATION_TEMPLATES[id].stopRules.length).toBeGreaterThan(0);
      expect(ORCHESTRATION_TEMPLATES[id].promptPayloads.length).toBeGreaterThan(
        0
      );
    }
  });

  it("keeps standing-order defaults aligned with current guardrails", () => {
    expect(defaultBudgetForTemplate(STANDING_ORDER_TEMPLATE_ID)).toEqual({
      maxIterations: 24,
      maxConsecutiveFailures: 3,
    });
  });

  it("returns budget copies so callers cannot mutate template defaults", () => {
    const budget = defaultBudgetForTemplate(STANDING_ORDER_TEMPLATE_ID);
    budget.maxIterations = 1;

    expect(
      defaultBudgetForTemplate(STANDING_ORDER_TEMPLATE_ID).maxIterations
    ).toBe(24);
  });
});
