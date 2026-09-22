import { expect, it } from "vitest";
import { overviewZoom, zoomScrollDelta } from "./realm-framing";

it("fills every viewport without exposing a rectangular map edge", () => {
  for (const [width, height] of [
    [1024, 768],
    [1400, 900],
    [1920, 1080],
    [2560, 1080],
  ]) {
    const zoom = overviewZoom(width, height, 2073, 1382.4);
    expect(2073 * zoom).toBeGreaterThanOrEqual(width - 1e-9);
    expect(1382.4 * zoom).toBeGreaterThanOrEqual(height - 1e-9);
    expect(zoom).toBeGreaterThan(0);
  }
  expect(Number.isFinite(overviewZoom(0, 0, 0, 0))).toBe(true);
});

it("keeps the world point under the cursor stable when zooming in or out", () => {
  for (const [oldZoom, newZoom] of [
    [0.7, 1.2],
    [1.2, 0.7],
  ]) {
    for (const pointer of [0, 280, 700, 1400]) {
      const oldScroll = 120;
      const oldWorld = oldScroll + 700 + (pointer - 700) / oldZoom;
      const newScroll =
        oldScroll + zoomScrollDelta(pointer, 1400, oldZoom, newZoom);
      expect(newScroll + 700 + (pointer - 700) / newZoom).toBeCloseTo(oldWorld);
    }
  }
});
