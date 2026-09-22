import { expect, it } from "vitest";
import { isCanvasClick } from "./canvas-click";

it("accepts only short primary gestures wholly owned by the canvas", () => {
  const canvas = new EventTarget();
  const overlay = new EventTarget();
  const gesture = {
    button: 0,
    downElement: canvas,
    upElement: canvas,
    getDistance: () => 0,
  };
  expect(isCanvasClick(gesture, canvas)).toBe(true);
  expect(isCanvasClick({ ...gesture, downElement: overlay }, canvas)).toBe(
    false
  );
  expect(isCanvasClick({ ...gesture, upElement: overlay }, canvas)).toBe(false);
  expect(isCanvasClick({ ...gesture, downElement: undefined }, canvas)).toBe(
    false
  );
  expect(isCanvasClick({ ...gesture, button: 2 }, canvas)).toBe(false);
  expect(isCanvasClick({ ...gesture, getDistance: () => 6 }, canvas)).toBe(
    false
  );
});
