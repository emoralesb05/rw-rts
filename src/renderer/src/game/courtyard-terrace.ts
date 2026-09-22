import type * as Phaser from "phaser";

export const TERRACE_KEY = "realm-dream-terrace";
export const COURTYARD_ATLAS_KEY = "realm-dream-courtyards";
export const COURTYARD_FRAME_SIZE = 512;

/** Decorative paving below physical objects, independently owned by its region. */
export function createCourtyardTerrace(
  scene: Phaser.Scene,
  x: number,
  y: number,
  district = 0
) {
  const painted = scene.textures.exists(COURTYARD_ATLAS_KEY);
  // Recessed silhouettes need a continuous walking surface beneath outer seats.
  const underlay =
    painted && [2, 4].includes(district % 6)
      ? scene.add
          .image(x, y + 34, TERRACE_KEY)
          .setDisplaySize(356, 258)
          .setDepth(-61)
      : undefined;
  const surface = scene.add
    // Extend the rear paving beneath the landmark's doorstep while keeping
    // the south aisle inside the terrace; no extra platform or floating gap.
    .image(
      x,
      y + 34,
      painted ? COURTYARD_ATLAS_KEY : TERRACE_KEY,
      painted ? district % 6 : undefined
    )
    .setDisplaySize(356, 258)
    .setDepth(-60);
  return {
    setVisible(visible: boolean) {
      surface.setVisible(visible);
      underlay?.setVisible(visible);
    },
    destroy() {
      surface.destroy();
      underlay?.destroy();
    },
  };
}
