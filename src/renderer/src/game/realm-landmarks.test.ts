import { createCanvas, loadImage } from "@napi-rs/canvas";
import { expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import {
  courtyardSlot,
  createRealmLandmarks,
  LANDMARK_FRAME_SIZE,
  LANDMARK_SCALE,
  COURTYARD_FURNISHINGS,
} from "./realm-landmarks";

it.each([false, true])(
  "shares physical depth and cleans regional scenery (atlas: %s)",
  (painted) => {
    const images: Array<{
      y: number;
      key: string;
      setDepth: ReturnType<typeof vi.fn>;
      setVisible: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    }> = [];
    const contact = {
      setDepth: vi.fn(() => contact),
      fillStyle: vi.fn(),
      fillEllipse: vi.fn(),
      setVisible: vi.fn(),
      destroy: vi.fn(),
    };
    const scene = {
      textures: { exists: () => painted },
      add: {
        graphics: () => contact,
        image: vi.fn((_x: number, y: number, key: string) => {
          const image = {
            y,
            key,
            setDisplaySize: vi.fn(() => image),
            setOrigin: vi.fn(() => image),
            setScale: vi.fn(() => image),
            setTint: vi.fn(() => image),
            setDepth: vi.fn(() => image),
            setVisible: vi.fn(() => image),
            destroy: vi.fn(),
          };
          images.push(image);
          return image;
        }),
      },
    };
    const ground = { add: vi.fn() };
    const region = createRealmLandmarks(
      scene as unknown as Phaser.Scene,
      0,
      ground as unknown as Phaser.GameObjects.Container
    );
    expect(images).toHaveLength(painted ? 26 : 24);
    const floors = images.filter(
      (image) => image.key === "realm-dream-terrace"
    );
    expect(floors).toHaveLength(painted ? 2 : 6);
    for (const floor of floors)
      expect(floor.setDepth).toHaveBeenCalledWith(painted ? -61 : -60);
    expect(ground.add).toHaveBeenCalledOnce();
    expect(contact.setDepth).toHaveBeenCalledWith(-59);
    expect(contact.fillEllipse).toHaveBeenCalledTimes(18);
    for (const image of images)
      expect(image.setDepth).toHaveBeenCalledWith(
        floors.includes(image)
          ? painted
            ? -61
            : -60
          : image.key === "realm-dream-courtyards"
            ? -60
            : image.y
      );
    region.setVisible(false);
    region.setVisible(true);
    for (const image of images)
      expect(image.setVisible).toHaveBeenLastCalledWith(true);
    region.destroy();
    region.destroy();
    expect(contact.destroy).toHaveBeenCalledOnce();
    expect(contact.setVisible).toHaveBeenLastCalledWith(true);
    for (const image of images) expect(image.destroy).toHaveBeenCalledOnce();
    for (const floor of floors) {
      expect(floor.setVisible).toHaveBeenLastCalledWith(true);
      expect(floor.destroy).toHaveBeenCalledOnce();
    }
  }
);

it("stages agents south of buildings within the authored courtyard", () => {
  for (const resting of [false, true]) {
    const slots = Array.from({ length: 12 }, (_, i) =>
      courtyardSlot(i, resting)
    );
    expect(new Set(slots.map((p) => `${p.x},${p.y}`)).size).toBe(12);
    for (const p of slots) {
      expect(Math.abs(p.x)).toBeLessThan(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(128);
    }
  }
  expect(courtyardSlot(Number.NaN)).toEqual(courtyardSlot(0));
});

it("ships six independently scalable landmarks with real transparent gutters", async () => {
  const image = await loadImage(
    "assets/environments/realm-dream-landmarks.png"
  );
  expect(image.width).toBe(LANDMARK_FRAME_SIZE * 3);
  expect(image.height).toBe(LANDMARK_FRAME_SIZE * 2);
  const context = createCanvas(image.width, image.height).getContext("2d");
  context.drawImage(image, 0, 0);
  for (let frame = 0; frame < 6; frame++) {
    const x = (frame % 3) * LANDMARK_FRAME_SIZE;
    const y = Math.floor(frame / 3) * LANDMARK_FRAME_SIZE;
    expect(context.getImageData(x, y, 1, 1).data[3]).toBe(0);
    const data = context.getImageData(x, y, 512, 512).data;
    let solid = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) solid++;
    expect(solid).toBeGreaterThan(40000);
    expect(solid).toBeLessThan(220000);
  }
  expect(85 * LANDMARK_SCALE).toBeGreaterThan(60);
  expect(85 * LANDMARK_SCALE).toBeLessThan(80);
});

it("keeps a central approach and separates staggered work positions", () => {
  const positions = Array.from({ length: 12 }, (_, i) => courtyardSlot(i));
  expect(new Set(positions.slice(0, 4).map((p) => p.y)).size).toBe(4);
  for (const [i, p] of positions.entries()) {
    expect(Math.abs(p.x)).toBeGreaterThanOrEqual(36);
    for (const q of positions.slice(i + 1))
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(44);
    expect(courtyardSlot(i, true).x).toBe(p.x);
    expect(courtyardSlot(i, true).y).toBe(p.y + 16);
  }
  expect(
    new Set(COURTYARD_FURNISHINGS.map((p) => JSON.stringify(p))).size
  ).toBe(6);
  for (const props of COURTYARD_FURNISHINGS)
    for (const [x] of props) expect(Math.abs(x)).toBeGreaterThan(140);
});
