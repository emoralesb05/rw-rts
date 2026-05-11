import { describe, expect, it } from "vitest";
import {
  projectViewportToTacticalMap,
  projectWorldToTacticalMap,
  tacticalCameraWorldView,
  unprojectTacticalMapToWorld,
  type TacticalBounds,
  type TacticalMapLayout,
} from "./tactical-map";

const bounds: TacticalBounds = {
  minX: 0,
  minY: 0,
  maxX: 100,
  maxY: 100,
};

const layout: TacticalMapLayout = {
  width: 120,
  height: 120,
  pad: 10,
};

describe("tactical map projection", () => {
  it("projects the visible safe gameplay window instead of the full canvas", () => {
    const view = tacticalCameraWorldView(
      { x: -100, y: -50, width: 500, height: 400 },
      { width: 1000, height: 800, zoomX: 2, zoomY: 2 },
      { left: 100, right: 200, top: 50, bottom: 150 }
    );

    expect(view).toEqual({
      x: -50,
      y: -25,
      width: 350,
      height: 300,
    });
  });

  it("round-trips world points through minimap coordinates", () => {
    const projected = projectWorldToTacticalMap(
      { x: 25, y: 75 },
      bounds,
      layout
    );
    expect(projected).toEqual({ x: 35, y: 85 });

    expect(unprojectTacticalMapToWorld(projected, bounds, layout)).toEqual({
      x: 25,
      y: 75,
    });
  });

  it("clips the viewport rectangle to the drawable minimap area", () => {
    const rect = projectViewportToTacticalMap(
      { x: -50, y: 25, width: 100, height: 50 },
      bounds,
      layout
    );

    expect(rect).toEqual({
      x: 10,
      y: 35,
      width: 50,
      height: 50,
    });
  });

  it("clamps minimap clicks outside the drawable area before unprojecting", () => {
    expect(
      unprojectTacticalMapToWorld({ x: -20, y: 160 }, bounds, layout)
    ).toEqual({
      x: 0,
      y: 100,
    });
  });
});
