import { expect, it } from "vitest";
import {
  layoutSiteLabels,
  screenRectToLabelObstacle,
  type SiteLabel,
} from "./site-label-layout";

it("reserves the selected label anchor in a crowded attention cluster", () => {
  const labels = Array.from({ length: 30 }, (_, index) => ({
    id: `agent-${index}`,
    x: 0,
    y: 0,
    width: 80,
    height: 28,
    priority: index === 29 ? 3 : 2,
  }));
  const positions = layoutSiteLabels(labels);
  expect(positions.get("agent-29")).toEqual({ x: 0, y: 0 });
  const values = [...positions.values()];
  for (let i = 0; i < values.length; i++)
    for (let j = i + 1; j < values.length; j++)
      expect(
        Math.abs(values[i].x - values[j].x) >= 85 ||
          Math.abs(values[i].y - values[j].y) >= 33
      ).toBe(true);
});

it("reserves a fixed tactical map after camera pan and zoom", () => {
  const obstacle = screenRectToLabelObstacle(
    { x: 580, y: 770, width: 240, height: 120 },
    { x: -400, y: 200, width: 2800, height: 1800 },
    { width: 1400, height: 900 }
  );
  expect(obstacle).toEqual({ x: 1000, y: 1740, width: 480, height: 240 });
  const label = {
    id: "ask",
    x: 1000,
    y: 1740,
    width: 160,
    height: 48,
    priority: 2,
  };
  expect(layoutSiteLabels([label], 5, [obstacle]).get("ask")).toEqual({
    x: 1000,
    y: 1687,
  });
});

it("keeps activity captions clear of district nameplates without moving the nameplates", () => {
  const obstacle = { x: 0, y: 148, width: 180, height: 44 };
  const result = layoutSiteLabels(
    [
      { id: "ask", x: 0, y: 140, width: 80, height: 20, priority: 2 },
      { id: "work", x: 10, y: 160, width: 80, height: 20, priority: 0 },
    ],
    5,
    [obstacle]
  );
  expect(result.get("ask")?.y).toBe(123);
  expect(result.get("work")?.y).toBe(197);
  expect(obstacle.y).toBe(148);
  expect(result.size).toBe(2);
});

it("moves a caption to the nearest free side of a neighboring silhouette", () => {
  const agent = { x: 0, y: 0, width: 32, height: 60 };
  const label = {
    id: "selected",
    x: 0,
    y: 24,
    width: 80,
    height: 20,
    priority: 2,
  };
  expect(layoutSiteLabels([label], 5, [agent]).get("selected")?.y).toBe(65);
  expect(label.y).toBe(24);
});

it("preserves the urgent anchor and separates neighboring labels deterministically", () => {
  const labels: SiteLabel[] = [
    { id: "edit", x: 30, y: 24, width: 80, height: 20, priority: 0 },
    { id: "ask", x: 0, y: 24, width: 80, height: 20, priority: 2 },
    { id: "read", x: 60, y: 24, width: 80, height: 20, priority: 0 },
    { id: "remote", x: 800, y: 24, width: 80, height: 20, priority: 0 },
  ];
  const result = layoutSiteLabels(labels);
  expect(result.get("ask")).toEqual({ x: 0, y: 24 });
  expect(result.get("edit")?.y).toBe(49);
  expect(result.get("read")).toEqual({ x: 85, y: 24 });
  expect(result.get("remote")).toEqual({ x: 800, y: 24 });
  expect([...layoutSiteLabels([...labels].reverse())]).toEqual([...result]);
  expect(labels.every((label) => label.y === 24)).toBe(true);
});

it("keeps every attention label distinct even at a shared crowded anchor", () => {
  const labels = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    x: 0,
    y: 0,
    width: 100,
    height: 18,
    priority: 2,
  }));
  const points = [...layoutSiteLabels(labels).values()];
  expect(points).toHaveLength(20);
  for (const [i, p] of points.entries())
    for (const q of points.slice(i + 1))
      expect(Math.abs(p.x - q.x) >= 105 || Math.abs(p.y - q.y) >= 23).toBe(
        true
      );
  expect(layoutSiteLabels([]).size).toBe(0);
});
