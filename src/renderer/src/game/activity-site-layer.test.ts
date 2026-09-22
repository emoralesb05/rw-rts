import { expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import { ActivitySiteLayer } from "./activity-site-layer";
import type { SessionActivity } from "./session-activity";

it("reuses markers, ignores drags, and destroys removed sites", () => {
  const makeObject = () => {
    const object: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of [
      "setOrigin",
      "setScale",
      "setFrame",
      "setTint",
      "setAlpha",
      "setDepth",
      "setInteractive",
      "on",
      "setText",
      "setColor",
      "setPosition",
      "setVisible",
      "destroy",
      "clear",
      "fillStyle",
      "fillEllipse",
      "fillRect",
      "fillTriangle",
      "lineStyle",
      "lineBetween",
      "fillCircle",
    ])
      object[method] = vi.fn(() => object);
    return object;
  };
  const text = makeObject();
  text.setScale.mockImplementation((scale: number) => {
    Object.assign(text, { scaleX: scale, scaleY: scale });
    return text;
  });
  const console = makeObject();
  const shadow = makeObject();
  const leaders = makeObject();
  const canvas = new EventTarget();
  const canvasGesture = { downElement: canvas, upElement: canvas };
  const scene = {
    game: { canvas },
    add: {
      text: vi.fn(() => text),
      image: vi.fn(() => console),
      ellipse: vi.fn(() => shadow),
      graphics: vi.fn(() => leaders),
    },
    cameras: { main: { zoom: 1 } },
  };
  const inspect = vi.fn();
  const groundObjects = { add: vi.fn() };
  const layer = new ActivitySiteLayer(
    scene as unknown as Phaser.Scene,
    inspect,
    groundObjects as unknown as Phaser.GameObjects.Container
  );
  const activity: SessionActivity = {
    id: "session:u",
    unitId: "u",
    worldId: "w",
    state: "blocked",
    label: "Needs you",
    symbol: "!",
    color: "#ffd18a",
    detail: "Ask",
  };
  const placements = [{ activity, x: 10, y: 20, displayName: "Mira" }];
  layer.sync(placements);
  layer.sync(placements);
  expect(scene.add.text).toHaveBeenCalledOnce();
  expect(text.setText).toHaveBeenCalledOnce();
  expect(groundObjects.add).toHaveBeenCalledExactlyOnceWith([shadow, console]);
  expect(console.setDepth).toHaveBeenLastCalledWith(8);
  expect(shadow.setDepth).toHaveBeenLastCalledWith(7.5);
  expect(console.setScale).toHaveBeenCalledWith(0.13 * 0.68);
  expect(console.setPosition).toHaveBeenLastCalledWith(-15, 8);
  layer.sync([{ ...placements[0], courtyardSlot: 2 }]);
  expect(console.setPosition).toHaveBeenLastCalledWith(35, 8);
  // Labels stay on the scene overlay, outside physical depth sorting.
  expect(text.setDepth).toHaveBeenLastCalledWith(65);
  const click = text.on.mock.calls[0][1] as unknown as (p: {
    button: number;
    downElement: EventTarget;
    upElement: EventTarget;
    getDistance: () => number;
  }) => void;
  click({ ...canvasGesture, button: 0, getDistance: () => 20 });
  click({
    ...canvasGesture,
    button: 0,
    upElement: new EventTarget(),
    getDistance: () => 0,
  });
  expect(inspect).not.toHaveBeenCalled();
  click({ ...canvasGesture, button: 0, getDistance: () => 0 });
  expect(inspect).toHaveBeenCalledWith("u");
  scene.cameras.main.zoom = 0.5;
  layer.sync(placements);
  expect(text.setScale).toHaveBeenLastCalledWith(2.4);
  expect(text.setVisible).toHaveBeenLastCalledWith(true);
  const quiet = [
    {
      ...placements[0],
      activity: { ...activity, state: "quiet" as const, label: "Quiet" },
    },
  ];
  layer.sync(quiet);
  expect(text.setVisible).toHaveBeenLastCalledWith(false);
  const hover = console.on.mock.calls.find(
    ([event]) => event === "pointerover"
  )?.[1] as unknown as () => void;
  const leave = console.on.mock.calls.find(
    ([event]) => event === "pointerout"
  )?.[1] as unknown as () => void;
  hover();
  layer.sync(quiet);
  expect(text.setVisible).toHaveBeenLastCalledWith(true);
  expect(text.setText).toHaveBeenLastCalledWith("Mira\n! Quiet");
  leave();
  layer.sync(quiet);
  expect(text.setVisible).toHaveBeenLastCalledWith(false);
  expect(text.setText).toHaveBeenLastCalledWith("! Quiet");
  layer.hoverAgent("u", true);
  layer.sync(quiet);
  expect(text.setText).toHaveBeenLastCalledWith("Mira\n! Quiet");
  layer.hoverAgent("other", false);
  layer.sync(quiet);
  expect(text.setVisible).toHaveBeenLastCalledWith(true);
  layer.hoverAgent("u", false);
  layer.sync(quiet);
  expect(text.setVisible).toHaveBeenLastCalledWith(false);
  const siteClick = console.on.mock.calls.find(
    ([event]) => event === "pointerup"
  )?.[1] as unknown as typeof click;
  inspect.mockClear();
  siteClick({ ...canvasGesture, button: 0, getDistance: () => 20 });
  siteClick({ ...canvasGesture, button: 2, getDistance: () => 0 });
  expect(inspect).not.toHaveBeenCalled();
  siteClick({ ...canvasGesture, button: 0, getDistance: () => 0 });
  expect(inspect).toHaveBeenCalledWith("u");
  layer.sync(quiet, "u");
  expect(text.setVisible).toHaveBeenLastCalledWith(true);
  expect(text.setText).toHaveBeenLastCalledWith("Mira\n! Quiet");
  layer.sync([{ ...quiet[0], displayName: "a".repeat(100) }], "u");
  expect(text.setText).toHaveBeenLastCalledWith(`${"a".repeat(27)}…\n! Quiet`);
  expect(shadow.setPosition).toHaveBeenLastCalledWith(-15, 10);
  Object.assign(text, { width: 80, height: 20 });
  layer.sync([{ ...placements[0], agentPosition: { x: 10, y: 40 } }], "u");
  expect(text.setPosition).toHaveBeenLastCalledWith(10, 53);
  expect(leaders.lineBetween).toHaveBeenLastCalledWith(10, 48, 10, 53);
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    layer.sync([
      {
        ...placements[0],
        settled: true,
        activity: { ...activity, state: "working" },
      },
    ]);
    const ended = [
      {
        ...placements[0],
        activity: { ...activity, state: "ended" as const, label: "Ended" },
      },
    ];
    layer.sync(ended);
    expect(console.setTint).toHaveBeenLastCalledWith(0xa3d9cb);
    expect(text.setVisible).toHaveBeenLastCalledWith(true);
    clock.mockReturnValue(2500);
    layer.sync(ended);
    expect(console.setTint).toHaveBeenLastCalledWith(0xffffff);
    expect(text.setVisible).toHaveBeenLastCalledWith(false);
  } finally {
    clock.mockRestore();
  }
  layer.sync([]);
  expect(text.destroy).toHaveBeenCalledOnce();
  expect(console.destroy).toHaveBeenCalledOnce();
  expect(shadow.destroy).toHaveBeenCalledOnce();
  layer.destroy();
  expect(leaders.destroy).toHaveBeenCalledOnce();
  expect(text.destroy).toHaveBeenCalledOnce();
});
