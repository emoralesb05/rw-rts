import { expect, it } from "vitest";
import { activityCaptionScale, showActivityCaption } from "./activity-caption";

it("keeps urgent and focused captions visible at every density and zoom", () => {
  for (const count of [1, 6, 12, 30]) {
    for (const zoom of [0.5, 1.1, 2]) {
      expect(showActivityCaption(zoom, count, true, false)).toBe(true);
      expect(showActivityCaption(zoom, count, false, true)).toBe(true);
    }
  }
});

it("shows routine captions only in close, uncrowded districts", () => {
  expect(showActivityCaption(1.1, 6, false, false)).toBe(true);
  expect(showActivityCaption(0.7, 6, false, false)).toBe(false);
  expect(showActivityCaption(2, 7, false, false)).toBe(false);
});

it("keeps attention readable at overview without unbounded map labels", () => {
  for (const zoom of [0.3, 0.5, 0.75, 1, 1.2])
    expect(10 * zoom * activityCaptionScale(zoom)).toBeCloseTo(12);
  expect(activityCaptionScale(2)).toBe(1);
  expect(activityCaptionScale(0.01)).toBe(4);
  expect(activityCaptionScale(0)).toBe(1);
  expect(activityCaptionScale(Number.NaN)).toBe(1);
});
