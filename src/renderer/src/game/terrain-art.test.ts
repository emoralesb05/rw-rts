import { createCanvas, loadImage } from "@napi-rs/canvas";
import { expect, it } from "vitest";

async function pixels(path: string) {
  const image = await loadImage(path);
  const context = createCanvas(image.width, image.height).getContext("2d");
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    data: context.getImageData(0, 0, image.width, image.height).data,
  };
}

function edgeDifference(image: Awaited<ReturnType<typeof pixels>>) {
  const { width, height, data } = image;
  let horizontal = 0,
    vertical = 0;
  for (let y = 0; y < height; y++)
    for (let channel = 0; channel < 3; channel++)
      horizontal += Math.abs(
        data[y * width * 4 + channel] -
          data[(y * width + width - 1) * 4 + channel]
      );
  for (let x = 0; x < width; x++)
    for (let channel = 0; channel < 3; channel++)
      vertical += Math.abs(
        data[x * 4 + channel] - data[((height - 1) * width + x) * 4 + channel]
      );
  return {
    horizontal: horizontal / (height * 3),
    vertical: vertical / (width * 3),
  };
}

it("preserves terrain dimensions and reduces mismatch at both repeating joins", async () => {
  const old = await pixels("assets/environments/realm-dream-ground.png");
  const connected = await pixels(
    "assets/environments/realm-dream-ground-districts.png"
  );
  expect([connected.width, connected.height]).toEqual([1536, 1024]);
  const before = edgeDifference(old),
    after = edgeDifference(connected);
  expect(after.horizontal).toBeLessThan(before.horizontal * 0.6);
  expect(after.vertical).toBeLessThan(before.vertical * 0.6);
  const previous = edgeDifference(
    await pixels("assets/environments/realm-dream-ground-connected.png")
  );
  expect(after.horizontal).toBeLessThan(previous.horizontal * 0.25);
  expect(after.vertical).toBeLessThan(previous.vertical * 0.25);
  // All four center exits have pale paving, not forest or water interruptions.
  for (const [x, y] of [
    [0, 512],
    [1535, 512],
    [768, 0],
    [768, 1023],
  ]) {
    const index = (y * connected.width + x) * 4;
    expect(connected.data[index]).toBeGreaterThan(150);
    expect(connected.data[index + 1]).toBeGreaterThan(140);
    expect(connected.data[index + 3]).toBe(255);
  }
});
