import type * as Phaser from "phaser";
import { COURTYARDS, terrainOrigin, TERRAIN_SCALE } from "./realm-terrain";
import { WORKSTATION_KEY, WORKSTATION_SCALE } from "./realm-workstations";
import { createCourtyardTerrace } from "./courtyard-terrace";
import { paintLandmarkContact } from "./landmark-grounding";

export const LANDMARK_KEY = "realm-dream-landmarks";
export const LANDMARK_FRAME_SIZE = 512;
// Authored doors are roughly 85 source pixels high, yielding 66 world pixels.
// Characters retain their existing scale; terrain scale must not resize buildings.
export const LANDMARK_SCALE = 0.78;
export const LANDMARK_FOOT_Y = 490;
export const LANDMARK_COURTYARD_OFFSET = 64;

/** Destination rectangles in ground-image coordinates, shared by the minimap. */
export function landmarkFootprints() {
  const scale = LANDMARK_SCALE / TERRAIN_SCALE;
  return COURTYARDS.map((court, frame) => ({
    frame,
    x: court.x - (LANDMARK_FRAME_SIZE * scale) / 2,
    y:
      court.y -
      LANDMARK_COURTYARD_OFFSET / TERRAIN_SCALE -
      LANDMARK_FOOT_Y * scale,
    width: LANDMARK_FRAME_SIZE * scale,
    height: LANDMARK_FRAME_SIZE * scale,
  }));
}

export function paintLandmarkThumbnail(
  context: CanvasRenderingContext2D,
  atlas: CanvasImageSource,
  thumbnailScale: number
) {
  for (const p of landmarkFootprints()) {
    context.drawImage(
      atlas,
      (p.frame % 3) * LANDMARK_FRAME_SIZE,
      Math.floor(p.frame / 3) * LANDMARK_FRAME_SIZE,
      LANDMARK_FRAME_SIZE,
      LANDMARK_FRAME_SIZE,
      p.x * thumbnailScale,
      p.y * thumbnailScale,
      p.width * thumbnailScale,
      p.height * thumbnailScale
    );
  }
}

export function courtyardSlot(slot: number, resting = false) {
  const index = Number.isFinite(slot) ? Math.abs(Math.floor(slot)) : 0;
  // Two staggered work wings leave the central approach clear. Seat identity
  // remains independent of occupancy and activity, so peers never reshuffle.
  const column = index % 4;
  return {
    x: [-88, -36, 36, 88][column],
    y: Math.floor(index / 4) * 44 + [12, 0, 8, 20][column] + (resting ? 16 : 0),
  };
}

// Scenery, not simulated work: each landmark has its own entrance composition.
export const COURTYARD_FURNISHINGS = [
  [
    [-148, 28, 2],
    [146, 94, 4],
  ], // workshop: armillary and lantern
  [
    [-150, 84, 5],
    [146, 12, 0],
  ], // archive: garden seat and book stand
  [
    [-148, 4, 4],
    [148, 92, 3],
  ], // crossroads: lantern and portal
  [
    [-146, 100, 5],
    [146, 22, 5],
  ], // garden: sheltered benches
  [
    [-148, 16, 0],
    [148, 100, 2],
  ], // observatory: reading and instruments
  [
    [-146, 90, 3],
    [148, 12, 4],
  ], // tide: portal and lantern
] as const;

/** Decorative scenery only: no fabricated monitoring state or interactive units. */
export function createRealmLandmarks(
  scene: Phaser.Scene,
  region: number,
  groundObjects: Phaser.GameObjects.Container
) {
  const origin = terrainOrigin(region);
  const contact = scene.add.graphics().setDepth(-59);
  for (const court of COURTYARDS)
    paintLandmarkContact(
      contact,
      origin.x + court.x * TERRAIN_SCALE,
      origin.y + court.y * TERRAIN_SCALE - LANDMARK_COURTYARD_OFFSET
    );
  const terraces = COURTYARDS.map((court, district) =>
    createCourtyardTerrace(
      scene,
      origin.x + court.x * TERRAIN_SCALE,
      origin.y + court.y * TERRAIN_SCALE,
      district
    )
  );
  const images = COURTYARDS.map((court, frame) =>
    scene.add
      .image(
        origin.x + court.x * TERRAIN_SCALE,
        origin.y + court.y * TERRAIN_SCALE - LANDMARK_COURTYARD_OFFSET,
        LANDMARK_KEY,
        frame
      )
      .setOrigin(0.5, LANDMARK_FOOT_Y / LANDMARK_FRAME_SIZE)
      .setScale(LANDMARK_SCALE)
  );
  // Sparse furniture frames the approach without occupying agent work slots.
  for (const [courtIndex, court] of COURTYARDS.entries()) {
    const x = origin.x + court.x * TERRAIN_SCALE;
    const y = origin.y + court.y * TERRAIN_SCALE;
    for (const [offsetX, offsetY, frame] of COURTYARD_FURNISHINGS[courtIndex]) {
      images.push(
        scene.add
          .image(x + offsetX, y + offsetY, WORKSTATION_KEY, frame)
          .setOrigin(0.5, 490 / 512)
          .setScale(WORKSTATION_SCALE * 0.9)
          .setTint(0xcbd6e2)
      );
    }
  }
  for (const image of images) image.setDepth(image.y);
  groundObjects.add(images);
  // Keep ownership regional without nesting: nesting would prevent actors
  // from sorting between individual buildings and courtyard furniture.
  return {
    setVisible(visible: boolean) {
      contact.setVisible(visible);
      for (const terrace of terraces) terrace.setVisible(visible);
      for (const image of images) image.setVisible(visible);
    },
    destroy() {
      if (terraces.length) contact.destroy();
      for (const terrace of terraces) terrace.destroy();
      terraces.length = 0;
      for (const image of images) image.destroy();
      images.length = 0;
    },
  };
}
