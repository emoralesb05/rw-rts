import { expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import type { OrchestrationRun } from "@shared/orchestration";
import { RunSiteLayer } from "./run-site-layer";

it("updates an existing run marker, ignores drags, and removes missing sites", () => {
  const marker = {
    text: "",
    style: { color: "" },
    setOrigin: vi.fn(),
    setDepth: vi.fn(),
    setInteractive: vi.fn(),
    on: vi.fn(),
    setPosition: vi.fn(),
    destroy: vi.fn(),
    setText: vi.fn((value: string) => {
      marker.text = value;
      return marker;
    }),
    setColor: vi.fn((value: string) => {
      marker.style.color = value;
      return marker;
    }),
  };
  marker.setOrigin.mockReturnValue(marker);
  marker.setDepth.mockReturnValue(marker);
  marker.setInteractive.mockReturnValue(marker);
  const canvas = new EventTarget();
  const canvasGesture = { downElement: canvas, upElement: canvas };
  const scene = { game: { canvas }, add: { text: vi.fn(() => marker) } };
  const inspect = vi.fn();
  const layer = new RunSiteLayer(scene as unknown as Phaser.Scene, inspect);
  const run: OrchestrationRun = {
    id: "r",
    template: "manual",
    title: "Task",
    status: "paused",
    createdAt: 1,
    updatedAt: 1,
    providerSessions: [],
    traceIds: [],
    permissionRequestIds: [],
    userInputRequestIds: [],
    steps: [],
    checkpoints: [],
    budget: {},
    events: [],
  };
  layer.sync([{ run, x: 1, y: 2 }], false);
  layer.sync([{ run: { ...run, status: "completed" }, x: 1, y: 2 }], false);
  expect(scene.add.text).toHaveBeenCalledOnce();
  expect(marker.text).toContain("completed");
  const click = marker.on.mock.calls[0][1] as (p: {
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
  expect(inspect).toHaveBeenCalledWith("r");
  layer.sync([{ run, x: 1, y: 2 }], true);
  expect(marker.text).toContain("unavailable");
  layer.sync([], false);
  expect(marker.destroy).toHaveBeenCalledOnce();
  layer.destroy();
  expect(marker.destroy).toHaveBeenCalledOnce();
});
