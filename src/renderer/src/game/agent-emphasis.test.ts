import { expect, it } from "vitest";
import { agentEmphasis } from "./agent-emphasis";

it("reserves strong rings for selection and observed attention", () => {
  for (const state of ["working", "quiet", "stale", "ended"] as const)
    expect(agentEmphasis(state, false).ring).toBe(false);
  for (const state of ["blocked", "attention"] as const) {
    expect(agentEmphasis(state, false).ring).toBe(true);
    expect(agentEmphasis(state, false).color).toBe(0xffc46b);
    expect(agentEmphasis(state, true).color).toBe(0x79d9ff);
    expect(agentEmphasis(state, true).effects).toBe(false);
  }
  expect(agentEmphasis("quiet", true).ring).toBe(true);
  expect(agentEmphasis("working", true).effects).toBe(true);
});
