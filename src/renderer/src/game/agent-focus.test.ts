import { expect, it } from "vitest";
import { agentFocusPoint, agentFocusCenter } from "./agent-focus";

it.each([1024, 1400, 1920])(
  "keeps focused agents beside a centered inspector at %s pixels",
  (width) => {
    const panel = { x: (width - 560) / 2, width: 560 };
    const point = agentFocusPoint(width, 768, [panel]);
    expect(point.x + 32).toBeLessThan(panel.x);
    expect(point.x).toBeGreaterThan(48);
  }
);

it("respects moved panels and the chat drawer without moving either", () => {
  const panels = [
    { x: 0, width: 300 },
    { x: 1000, width: 400 },
  ];
  expect(agentFocusPoint(1400, 900, panels).x).toBe(650);
  expect(panels[0].x).toBe(0);
  expect(agentFocusPoint(300, 600, [{ x: 0, width: 300 }]).x).toBe(150);
});

it.each([0.5, 1, 1.5])(
  "projects the actor into the chosen band at zoom %s",
  (zoom) => {
    const panels = [{ x: 420, width: 560 }];
    const actor = { x: 900, y: 700 };
    const center = agentFocusCenter(actor, 1400, 900, zoom, panels);
    const point = agentFocusPoint(1400, 900, panels);
    expect((actor.x - center.x) * zoom + 700).toBeCloseTo(point.x);
    expect((actor.y - 24 - center.y) * zoom + 450).toBeCloseTo(point.y);
  }
);
