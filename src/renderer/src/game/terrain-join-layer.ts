import type * as Phaser from "phaser";
import {
  TERRAIN_KEY,
  TERRAIN_SCALE,
  TERRAIN_WIDTH,
  TERRAIN_HEIGHT,
  terrainOrigin,
} from "./realm-terrain";

// Quiet water borders need only a small color transition. Wide strips mirror
// nearby rocks into the water and make the seam look like a reflection band.
const STRIP = 8;
const EDGE = STRIP * TERRAIN_SCALE;

/** Symmetric half-opacity edge blends. No source-asset edits or world relocation. */
export class TerrainJoinLayer {
  private joins = new Map<string, Phaser.GameObjects.Image[]>();
  constructor(private scene: Phaser.Scene) {
    const texture = scene.textures.get(TERRAIN_KEY);
    for (const [name, x, y, width, height] of [
      ["join-left", 0, 0, STRIP, 1024],
      ["join-right", 1536 - STRIP, 0, STRIP, 1024],
      ["join-top", 0, 0, 1536, STRIP],
      ["join-bottom", 0, 1024 - STRIP, 1536, STRIP],
    ] as const) {
      if (!texture.has(name)) texture.add(name, 0, x, y, width, height);
    }
  }

  sync(regions: ReadonlySet<number>) {
    const live = new Set<string>();
    for (const id of regions) {
      const origin = terrainOrigin(id);
      for (const direction of ["east", "south"] as const) {
        if (direction === "east" && id % 3 === 2) continue;
        if (!regions.has(id + (direction === "east" ? 1 : 3))) continue;
        const key = `${id}:${direction}`;
        live.add(key);
        if (this.joins.has(key)) continue;
        const make = (x: number, y: number, frame: string) =>
          this.scene.add
            .image(x, y, TERRAIN_KEY, frame)
            .setOrigin(0)
            .setScale(TERRAIN_SCALE)
            .setDepth(-64);
        if (direction === "east") {
          // Phaser flips geometry and its vertex alpha corners together, so the
          // pre-flip ramps below put half opacity at the shared boundary.
          const x = origin.x + TERRAIN_WIDTH;
          this.joins.set(key, [
            make(x - EDGE, origin.y, "join-left")
              .setFlipX(true)
              .setAlpha(0.5, 0, 0.5, 0),
            make(x, origin.y, "join-right")
              .setFlipX(true)
              .setAlpha(0, 0.5, 0, 0.5),
          ]);
        } else {
          const y = origin.y + TERRAIN_HEIGHT;
          this.joins.set(key, [
            make(origin.x, y - EDGE, "join-top")
              .setFlipY(true)
              .setAlpha(0.5, 0.5, 0, 0),
            make(origin.x, y, "join-bottom")
              .setFlipY(true)
              .setAlpha(0, 0, 0.5, 0.5),
          ]);
        }
      }
    }
    for (const [key, images] of this.joins)
      if (!live.has(key)) {
        for (const image of images) image.destroy();
        this.joins.delete(key);
      }
  }

  destroy() {
    for (const images of this.joins.values())
      for (const image of images) image.destroy();
    this.joins.clear();
  }
}
