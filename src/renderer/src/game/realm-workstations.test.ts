import { createCanvas, loadImage } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import type { SessionActivity } from "./session-activity";
import { workstationFrame, WORKSTATION_SCALE } from "./realm-workstations";

it("maps observed activity to furniture without implying task completion", () => {
  const base: SessionActivity = {
    id: "s",
    unitId: "u",
    worldId: "w",
    label: "Reading",
    state: "working",
    symbol: "",
    color: "",
    detail: "",
  };
  for (const [label, frame] of [
    ["Reading", 0],
    ["Searching", 0],
    ["Editing", 1],
    ["Command", 2],
    ["Research", 3],
    ["Delegating", 3],
  ] as const)
    expect(workstationFrame({ ...base, label })).toBe(frame);
  expect(workstationFrame({ ...base, state: "blocked" })).toBe(4);
  expect(workstationFrame({ ...base, state: "attention" })).toBe(4);
  for (const state of ["quiet", "stale", "ended"] as const)
    expect(workstationFrame({ ...base, state })).toBe(5);
});

it("ships six transparent furniture frames at character-relative scale", async () => {
  const image = await loadImage(
    "assets/environments/realm-dream-workstations.png"
  );
  expect([image.width, image.height]).toEqual([1536, 1024]);
  const context = createCanvas(1536, 1024).getContext("2d");
  context.drawImage(image, 0, 0);
  for (let frame = 0; frame < 6; frame++) {
    const data = context.getImageData(
      (frame % 3) * 512,
      Math.floor(frame / 3) * 512,
      512,
      512
    ).data;
    let transparent = 0;
    let solid = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparent++;
      if (data[i] > 200) solid++;
    }
    expect(transparent).toBeGreaterThan(50000);
    expect(solid).toBeGreaterThan(20000);
  }
  expect(512 * WORKSTATION_SCALE).toBeLessThan(70);
});
