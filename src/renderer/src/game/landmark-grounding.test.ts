import { expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import { paintLandmarkContact } from "./landmark-grounding";
import { LANDMARK_COURTYARD_OFFSET } from "./realm-landmarks";

it("keeps static contact shading behind the working aisle", () => {
  const graphics = { fillStyle: vi.fn(), fillEllipse: vi.fn() };
  paintLandmarkContact(
    graphics as unknown as Phaser.GameObjects.Graphics,
    300,
    400
  );
  expect(graphics.fillEllipse).toHaveBeenCalledTimes(3);
  for (const [x, y, width, height] of graphics.fillEllipse.mock.calls) {
    expect(x).toBe(300);
    expect(y + height / 2).toBeLessThan(400 + LANDMARK_COURTYARD_OFFSET);
    expect(width).toBeLessThan(356);
  }
  for (const [, alpha] of graphics.fillStyle.mock.calls) {
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(0.1);
  }
});
