import { describe, expect, it, vi } from "vitest";
import type { WorldTheme } from "./realm-worlds";

vi.mock("phaser", () => ({}));

import {
  WORLD_MAP_GRID,
  worldMapDesignFor,
  worldTileTone,
} from "./world-map-design";

const THEMES: WorldTheme[] = [
  "citadel",
  "bastion",
  "crossroads",
  "tide",
  "dusk",
  "lantern",
];

describe("world map designs", () => {
  it.each(THEMES)("keeps the %s footprint valid and navigable", (theme) => {
    const design = worldMapDesignFor(theme);

    expect(design.tiles).toHaveLength(WORLD_MAP_GRID);
    for (const row of design.tiles) {
      expect(row).toHaveLength(WORLD_MAP_GRID);
      expect(row).toMatch(/^[.gpa]+$/);
    }

    expect(worldTileTone(theme, 2, 2)).not.toBe(".");
    expect(worldTileTone(theme, 3, 3)).not.toBe(".");
    expect(design.tiles.join("")).toContain("p");
    expect(design.tiles.join("")).toContain("a");
  });

  it.each(THEMES)("keeps %s environmental props inside its map", (theme) => {
    const design = worldMapDesignFor(theme);

    expect(design.props.length).toBeGreaterThanOrEqual(5);
    for (const prop of design.props) {
      expect(prop.at[0]).toBeGreaterThanOrEqual(0);
      expect(prop.at[0]).toBeLessThan(WORLD_MAP_GRID);
      expect(prop.at[1]).toBeGreaterThanOrEqual(0);
      expect(prop.at[1]).toBeLessThan(WORLD_MAP_GRID);
    }
  });

  it("gives every theme a distinct terrain footprint", () => {
    const footprints = THEMES.map((theme) =>
      worldMapDesignFor(theme).tiles.join("/")
    );

    expect(new Set(footprints).size).toBe(THEMES.length);
  });
});
