import type * as Phaser from "phaser";

/** Static contact shading, below every actor and building. Never encodes state. */
export function paintLandmarkContact(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  doorstepY: number
) {
  // Overlapping low-opacity lobes avoid a hard floating-platform outline.
  for (const [width, height, alpha] of [
    [238, 48, 0.045],
    [198, 32, 0.065],
    [150, 18, 0.085],
  ]) {
    graphics.fillStyle(0x17263b, alpha);
    graphics.fillEllipse(x, doorstepY + 4, width, height, 32);
  }
}
