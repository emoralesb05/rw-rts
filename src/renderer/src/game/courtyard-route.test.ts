import { expect, it } from "vitest";
import { arrivalKey, courtyardRoute } from "./courtyard-route";

it("crosses between columns below all workstation rows", () => {
  const center = { x: 500, y: 300 };
  const start = { x: 410, y: 300 };
  const target = { x: 590, y: 348 };
  expect(courtyardRoute(start, target, center)).toEqual([
    { x: 410, y: 428 },
    { x: 590, y: 428 },
    target,
  ]);
  expect(start).toEqual({ x: 410, y: 300 });
});

it("takes a direct column approach and does not walk in place", () => {
  const center = { x: 0, y: 0 };
  expect(courtyardRoute(center, { x: 0, y: 40 }, center)).toEqual([
    { x: 0, y: 40 },
  ]);
  expect(courtyardRoute(center, center, center)).toEqual([]);
});

it("retargets from an aisle without backtracking or duplicate points", () => {
  expect(
    courtyardRoute({ x: 20, y: 128 }, { x: -90, y: 0 }, { x: 0, y: 0 })
  ).toEqual([
    { x: -90, y: 128 },
    { x: -90, y: 0 },
  ]);
});

it("does not claim to route between distant districts", () => {
  expect(
    courtyardRoute({ x: 900, y: 700 }, { x: 0, y: 40 }, { x: 0, y: 0 })
  ).toEqual([{ x: 0, y: 40 }]);
});

it("invalidates arrivals when formation, district, or mode changes", () => {
  const key = arrivalKey("mission", "one", { x: 0, y: 0 });
  expect(arrivalKey("mission", "one", { x: 60, y: 0 })).not.toBe(key);
  expect(arrivalKey("mission", "two", { x: 0, y: 0 })).not.toBe(key);
  expect(arrivalKey("base", "one", { x: 0, y: 0 })).not.toBe(key);
});
