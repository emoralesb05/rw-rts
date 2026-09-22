import type { WorldState } from "@shared/events";
import { clusterKeyFor } from "./cluster-layout";
import { themeFor, type WorldTheme } from "./realm-worlds";

export const TERRAIN_KEY = "realm-valley";
export const TERRAIN_SCALE = 1.35;
export const TERRAIN_WIDTH = 1536 * TERRAIN_SCALE;
export const TERRAIN_HEIGHT = 1024 * TERRAIN_SCALE;
// Authored walkable courtyard anchors in the terrain plate, not building roofs.
export const COURTYARDS = [
  { theme: "bastion", x: 300, y: 300 },
  { theme: "citadel", x: 740, y: 300 },
  { theme: "crossroads", x: 1190, y: 280 },
  { theme: "dusk", x: 280, y: 710 },
  { theme: "lantern", x: 750, y: 710 },
  { theme: "tide", x: 1220, y: 760 },
] as const;

export type TerrainPlacement = {
  x: number;
  y: number;
  clusterKey: string;
  region: number;
  theme: WorldTheme;
};

export function terrainOrigin(region: number) {
  return {
    x: (region % 3) * TERRAIN_WIDTH - 750 * TERRAIN_SCALE,
    y: Math.floor(region / 3) * TERRAIN_HEIGHT - 480 * TERRAIN_SCALE,
  };
}

/** Six real selectable worlds per terrain region; overflow creates another region. */
export function computeTerrainLayout(worlds: Record<string, WorldState>) {
  const sorted = Object.values(worlds).sort((a, b) => a.id.localeCompare(b.id));
  const result = new Map<string, TerrainPlacement>();
  for (let start = 0; start < sorted.length; start += COURTYARDS.length) {
    const region = start / COURTYARDS.length;
    const origin = terrainOrigin(region);
    const available = new Set<number>(COURTYARDS.map((_, i) => i));
    const pending: WorldState[] = [];
    const assign = (world: WorldState, slot: number) => {
      const court = COURTYARDS[slot];
      available.delete(slot);
      result.set(world.id, {
        x: origin.x + court.x * TERRAIN_SCALE,
        y: origin.y + court.y * TERRAIN_SCALE,
        region,
        theme: court.theme,
        clusterKey: clusterKeyFor(world.path),
      });
    };
    for (const world of sorted.slice(start, start + COURTYARDS.length)) {
      const preferred = COURTYARDS.findIndex(
        (c) => c.theme === themeFor(world.id)
      );
      if (available.has(preferred)) assign(world, preferred);
      else pending.push(world);
    }
    for (const world of pending)
      assign(world, available.values().next().value!);
  }
  return result;
}
