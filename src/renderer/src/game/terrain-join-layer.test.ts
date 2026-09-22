import { expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import { TerrainJoinLayer } from "./terrain-join-layer";

it("blends only adjacent regions, reuses joins, and cleans up shrinking terrain", () => {
  const images: Record<string, ReturnType<typeof vi.fn>>[] = [];
  const texture = { has: vi.fn(() => false), add: vi.fn() };
  const scene = {
    textures: { get: () => texture },
    add: {
      image: vi.fn(() => {
        const image: Record<string, ReturnType<typeof vi.fn>> = {};
        for (const method of [
          "setOrigin",
          "setScale",
          "setDepth",
          "setFlipX",
          "setFlipY",
          "setAlpha",
          "destroy",
        ])
          image[method] = vi.fn(() => image);
        images.push(image);
        return image;
      }),
    },
  };
  const layer = new TerrainJoinLayer(scene as unknown as Phaser.Scene);
  expect(texture.add).toHaveBeenCalledTimes(4);
  layer.sync(new Set([0, 1, 2, 3, 4, 5]));
  expect(images).toHaveLength(14); // four east joins, three south joins
  // These ramps account for Phaser flipping geometry and vertex alpha together.
  expect(images[0].setFlipX).toHaveBeenCalledWith(true);
  expect(images[0].setAlpha).toHaveBeenCalledWith(0.5, 0, 0.5, 0);
  expect(images[1].setAlpha).toHaveBeenCalledWith(0, 0.5, 0, 0.5);
  expect(images[2].setFlipY).toHaveBeenCalledWith(true);
  expect(images[2].setAlpha).toHaveBeenCalledWith(0.5, 0.5, 0, 0);
  expect(images[3].setAlpha).toHaveBeenCalledWith(0, 0, 0.5, 0.5);
  layer.sync(new Set([0, 1, 2, 3, 4, 5]));
  expect(images).toHaveLength(14);
  for (const image of images) {
    expect(image.setDepth).toHaveBeenCalledWith(-64);
    expect(image.setAlpha).toHaveBeenCalledOnce();
  }
  layer.sync(new Set([2, 3])); // adjacent IDs but different rows: no join
  for (const image of images) expect(image.destroy).toHaveBeenCalledOnce();
  layer.sync(new Set([0, 1]));
  expect(images).toHaveLength(16);
  layer.destroy();
  layer.destroy();
  for (const image of images) expect(image.destroy).toHaveBeenCalledOnce();
});
