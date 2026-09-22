import type * as Phaser from "phaser";
import { terrainOrigin, TERRAIN_SCALE } from "./realm-terrain";

// Decorative environment lights only; never encode operational agent state.
const GARDEN_LIGHTS = [
  [180, 440],
  [470, 490],
  [570, 580],
  [690, 830],
  [885, 710],
  [1030, 420],
  [1320, 620],
  [1130, 880],
  [340, 860],
] as const;

export function paintTerrainAmbience(
  g: Phaser.GameObjects.Graphics,
  regions: readonly number[],
  time: number
) {
  g.clear();
  for (const region of regions) {
    const origin = terrainOrigin(region);
    g.save();
    g.translateCanvas(origin.x, origin.y);
    g.scaleCanvas(TERRAIN_SCALE, TERRAIN_SCALE);
    for (const [i, [anchorX, anchorY]] of GARDEN_LIGHTS.entries()) {
      const x = anchorX + Math.sin(time * 0.3 + i) * 9;
      const y = anchorY + Math.cos(time * 0.22 + i * 2) * 5;
      const flicker = 0.6 + Math.sin(time * 0.8 + i * 2.1) * 0.25;
      g.fillStyle(0xbaabf2, flicker * 0.07);
      g.fillCircle(x, y, 10);
      g.fillStyle(0xd5f5ff, flicker * 0.6);
      g.fillEllipse(x, y, 2, 3);
    }
    // Small moving highlights follow open water, not the stone bridge.
    for (let i = 0; i < 12; i++) {
      const x = 1400 + Math.sin(i * 2.1) * 34;
      const y = 130 + i * 18 + ((time * 8) % 18);
      g.lineStyle(1, 0xb6e5df, 0.08 + Math.sin(time * 1.2 + i) * 0.04);
      g.lineBetween(x, y, x + 7 + (i % 3) * 4, y + 2);
    }
    g.restore();
  }
}
