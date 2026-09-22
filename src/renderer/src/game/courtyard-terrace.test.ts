import { createCanvas, loadImage } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { courtyardSlot } from "./realm-landmarks";

it("ships six isolated courtyard frames with transparent gutters and readable walking surfaces", async () => {
  const image = await loadImage(
    "assets/environments/realm-dream-courtyards-integrated.png"
  );
  expect([image.width, image.height]).toEqual([1536, 1024]);
  const context = createCanvas(image.width, image.height).getContext("2d");
  context.drawImage(image, 0, 0);
  for (let frame = 0; frame < 6; frame++) {
    const x = (frame % 3) * 512,
      y = Math.floor(frame / 3) * 512;
    expect(context.getImageData(x, y, 1, 1).data[3]).toBeLessThan(10);
    const center = context.getImageData(x + 256, y + 256, 1, 1).data;
    expect(center[3]).toBeGreaterThan(240);
    expect(center[0]).toBeGreaterThan(130);
    // Only the crossroads and observatory retain a coverage underlay.
    if (![2, 4].includes(frame))
      for (const resting of [false, true])
        for (let slot = 0; slot < 12; slot++) {
          const seat = courtyardSlot(slot, resting);
          expect(
            context.getImageData(
              x + 256 + (seat.x / 356) * 512,
              y + 256 + ((seat.y - 34) / 258) * 512,
              1,
              1
            ).data[3]
          ).toBeGreaterThan(200);
        }
  }
});

it("ships painted courtyard paving with transparent surroundings and an opaque-looking center", async () => {
  const image = await loadImage("assets/environments/realm-dream-paving.png");
  const context = createCanvas(image.width, image.height).getContext("2d");
  context.drawImage(image, 0, 0);
  for (const [x, y] of [
    [0, 0],
    [image.width - 1, 0],
    [0, image.height - 1],
    [image.width - 1, image.height - 1],
  ])
    expect(context.getImageData(x, y, 1, 1).data[3]).toBe(0);
  expect(
    context.getImageData(image.width / 2, image.height / 2, 1, 1).data[3]
  ).toBeGreaterThanOrEqual(245);
});
