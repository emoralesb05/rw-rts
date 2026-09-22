import { expect, it } from "vitest";
import { stationFeedback } from "./station-feedback";

it("acknowledges only an observed working-to-ended transition, once", () => {
  expect(stationFeedback(undefined, "ended", true, 100).acknowledging).toBe(
    false
  );
  const working = stationFeedback(undefined, "working", true, 100);
  const ended = stationFeedback(working, "ended", true, 200);
  expect(ended.acknowledging).toBe(true);
  expect(stationFeedback(ended, "ended", true, 1599).acknowledging).toBe(true);
  const settled = stationFeedback(ended, "ended", true, 1600);
  expect(settled.acknowledging).toBe(false);
  expect(stationFeedback(settled, "ended", true, 9000).acknowledging).toBe(
    false
  );
  expect(stationFeedback(ended, "blocked", true, 300).acknowledgedUntil).toBe(
    0
  );
});

it("animates only fresh working agents at their stations", () => {
  expect(stationFeedback(undefined, "working", true, 100).alpha).not.toBe(1);
  expect(stationFeedback(undefined, "working", false, 100).alpha).toBe(1);
  for (const state of [
    "blocked",
    "attention",
    "stale",
    "quiet",
    "ended",
  ] as const) {
    expect(stationFeedback(undefined, state, true, 100).alpha).toBe(
      stationFeedback(undefined, state, true, 500).alpha
    );
  }
});
