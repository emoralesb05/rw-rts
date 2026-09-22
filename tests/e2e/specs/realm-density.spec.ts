import { test, expect } from "../fixtures/electron";
import {
  seedWorldCommand,
  waitForRealmkeeper,
  type RwE2eWindow,
} from "../helpers/app";

type BusyScene = {
  terrainRegions: Map<number, unknown>;
  cameras: {
    main: {
      worldView: { x: number; y: number; width: number; height: number };
    };
  };
  courtyardFor(
    world: unknown,
    slot: number
  ): { x: number; y: number; annex: number };
  activitySites: { markers: Map<string, { text: { visible: boolean } }> };
  worlds: Map<
    string,
    {
      wielders: Map<
        string,
        {
          courtyardIndex?: number;
          isTraveling: boolean;
          orderRing: { visible: boolean; strokeColor: number };
          container: { x: number; y: number };
        }
      >;
    }
  >;
};

test("one project expands to authored annexes and focuses asks in every courtyard", async ({
  appPage: page,
}, testInfo) => {
  await waitForRealmkeeper(page);
  await seedWorldCommand(page);
  await page.evaluate(() =>
    (window as unknown as BusyWindow).__rwSeedVisualQa?.(Date.now(), true, true)
  );
  await page.getByRole("button", { name: "Close world command" }).click();
  await expect(
    page.getByRole("button", { name: "Next ask · 3" })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (
          window as unknown as BusyWindow
        ).__phaser!.scene.getScene("kingdom");
        return [...scene.worlds.values()].reduce(
          (n, world) => n + world.wielders.size,
          0
        );
      })
    )
    .toBe(30);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = (
            window as unknown as BusyWindow
          ).__phaser!.scene.getScene("kingdom");
          return [...scene.worlds.values()].every((world) =>
            [...world.wielders.values()].every((ref) => {
              const court = scene.courtyardFor(world, ref.courtyardIndex!);
              return (
                !ref.isTraveling &&
                Math.abs(ref.container.x - court.x) <= 91 &&
                ref.container.y >= court.y &&
                ref.container.y <= court.y + 128
              );
            })
          );
        }),
      { timeout: 15_000 }
    )
    .toBe(true);
  const distribution = await page.evaluate(() => {
    const scene = (window as unknown as BusyWindow).__phaser!.scene.getScene(
      "kingdom"
    );
    const counts = [0, 0, 0];
    for (const world of scene.worlds.values())
      for (const ref of world.wielders.values())
        counts[scene.courtyardFor(world, ref.courtyardIndex!).annex]++;
    return { counts, regions: scene.terrainRegions.size };
  });
  expect(distribution).toEqual({ counts: [12, 12, 6], regions: 2 });
  const visited = new Set<string>();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Next ask · 3" }).click();
    const close = page.getByRole("button", { name: /^Close Agent / });
    await expect(close).toBeVisible();
    visited.add((await close.getAttribute("aria-label"))!);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const win = window as unknown as BusyWindow;
          const selected = (
            win.__rwStore.getState() as unknown as { selectedUnitId: string }
          ).selectedUnitId;
          const scene = win.__phaser!.scene.getScene("kingdom");
          const ref = [...scene.worlds.values()]
            .flatMap((world) => [...world.wielders])
            .find(([id]) => id === selected)?.[1];
          const view = scene.cameras.main.worldView;
          return (
            !!ref &&
            ref.container.x > view.x &&
            ref.container.x < view.x + view.width &&
            ref.container.y > view.y &&
            ref.container.y < view.y + view.height
          );
        })
      )
      .toBe(true);
    await close.click();
    if (i === 0)
      await page.screenshot({
        path: testInfo.outputPath("overflow-annex.png"),
      });
  }
  expect(visited.size).toBe(3);
  const originalSeats = await page.evaluate(() => {
    const scene = (window as unknown as BusyWindow).__phaser!.scene.getScene(
      "kingdom"
    );
    return Object.fromEntries(
      [...scene.worlds.values()].flatMap((world) =>
        [...world.wielders].map(([id, ref]) => [id, ref.courtyardIndex])
      )
    );
  });
  await page.evaluate(() => {
    const win = window as unknown as BusyWindow;
    const state = win.__rwStore.getState() as unknown as {
      units: Record<string, Record<string, unknown>>;
      worlds: Record<string, { unitIds: string[] }>;
    };
    const units = { ...state.units };
    const old = units["busy-0-29"];
    delete units["busy-0-29"];
    units["overflow-arrival"] = {
      ...old,
      id: "overflow-arrival",
      sessionId: "overflow-arrival",
      status: "fallen",
    };
    const worlds = Object.fromEntries(
      Object.entries(state.worlds).map(([id, world]) => [
        id,
        {
          ...world,
          unitIds: world.unitIds.map((unit) =>
            unit === "busy-0-29" ? "overflow-arrival" : unit
          ),
        },
      ])
    );
    win.__rwStore.setState({ units, worlds });
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (
          window as unknown as BusyWindow
        ).__phaser!.scene.getScene("kingdom");
        return [...scene.worlds.values()].some(
          (world) =>
            world.wielders.has("overflow-arrival") &&
            !world.wielders.has("busy-0-29")
        );
      })
    )
    .toBe(true);
  const replacement = await page.evaluate(() => {
    const scene = (window as unknown as BusyWindow).__phaser!.scene.getScene(
      "kingdom"
    );
    const world = [...scene.worlds.values()][0];
    const ref = world.wielders.get("overflow-arrival")!;
    const court = scene.courtyardFor(world, ref.courtyardIndex!);
    return {
      seats: Object.fromEntries(
        [...world.wielders].map(([id, ref]) => [id, ref.courtyardIndex])
      ),
      dx: Math.abs(ref.container.x - court.x),
      dy: ref.container.y - court.y,
    };
  });
  expect(replacement.seats["overflow-arrival"]).toBe(
    originalSeats["busy-0-29"]
  );
  for (const [id, slot] of Object.entries(originalSeats)) {
    if (id !== "busy-0-29") expect(replacement.seats[id]).toBe(slot);
  }
  expect(replacement.dx).toBeLessThanOrEqual(90);
  expect(replacement.dy).toBeGreaterThanOrEqual(0);
  expect(replacement.dy).toBeLessThan(128);
  await expect(
    page.getByRole("button", { name: "Next ask · 3" })
  ).toBeVisible();
});
type BusyWindow = RwE2eWindow & {
  __phaser?: { scene: { getScene(key: string): BusyScene } };
  __rwStore: NonNullable<RwE2eWindow["__rwStore"]> & {
    setState(patch: Record<string, unknown>): void;
  };
};

test("thirty agents retain unique stable seats and all blocked sessions stay reachable", async ({
  appPage: page,
}, testInfo) => {
  await waitForRealmkeeper(page);
  await seedWorldCommand(page);
  await page.evaluate(() =>
    (window as unknown as BusyWindow).__rwSeedVisualQa?.(Date.now(), true)
  );
  await page.getByRole("button", { name: "Close world command" }).click();
  await expect(
    page.getByRole("button", { name: "Next ask · 6" })
  ).toBeVisible();

  const seating = () =>
    page.evaluate(() => {
      const scene = (window as unknown as BusyWindow).__phaser?.scene.getScene(
        "kingdom"
      );
      if (!scene) throw new Error("Isolated E2E scene hook missing");
      return [...scene.worlds.values()].flatMap((world) =>
        [...world.wielders].map(([id, ref]) => ({
          id,
          slot: ref.courtyardIndex,
          traveling: ref.isTraveling,
          ring: ref.orderRing.visible,
          ringColor: ref.orderRing.strokeColor,
          x: ref.container.x,
          y: ref.container.y,
        }))
      );
    });
  await expect.poll(async () => (await seating()).length).toBe(30);
  await expect
    .poll(async () => (await seating()).some((ref) => ref.traveling), {
      timeout: 15_000,
    })
    .toBe(false);
  const before = await seating();
  expect(before.filter((ref) => ref.ring)).toHaveLength(6);
  expect(before.find((ref) => ref.id === "busy-0-0")?.ringColor).toBe(0x79d9ff);
  const crowded = before.filter((ref) => ref.id.startsWith("busy-0-"));
  expect(crowded).toHaveLength(12);
  expect(new Set(crowded.map((ref) => ref.slot)).size).toBe(12);
  for (let i = 0; i < crowded.length; i++) {
    for (let j = i + 1; j < crowded.length; j++) {
      expect(
        Math.hypot(crowded[i].x - crowded[j].x, crowded[i].y - crowded[j].y)
      ).toBeGreaterThan(20);
    }
  }
  await page.mouse.move(700, 25);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (
          window as unknown as BusyWindow
        ).__phaser!.scene.getScene("kingdom");
        return [...scene.activitySites.markers].filter(
          ([id, marker]) =>
            id.startsWith("session:busy-0-") && marker.text.visible
        ).length;
      })
    )
    .toBe(1);
  await page.screenshot({ path: testInfo.outputPath("busy-settlement.png") });

  // A state transition must not reshuffle the district's assigned seats.
  await page.evaluate(() => {
    const store = (window as unknown as BusyWindow).__rwStore;
    const units = store.getState().units;
    store.setState({
      units: {
        ...units,
        "busy-0-3": {
          ...units["busy-0-3"],
          status: "working",
          lastActivity: Date.now(),
        },
      },
    });
  });
  await page.waitForTimeout(300);
  const after = await seating();
  expect(after.map(({ id, slot }) => ({ id, slot }))).toEqual(
    before.map(({ id, slot }) => ({ id, slot }))
  );

  const visited = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await page.getByRole("button", { name: "Next ask · 6" }).click();
    const close = page.getByRole("button", { name: /^Close Agent / });
    await expect(close).toBeVisible();
    visited.add((await close.getAttribute("aria-label"))!);
    await expect(
      page.getByRole("button", { name: "Review blocking ask" })
    ).toBeVisible();
    await close.click();
  }
  expect(visited.size).toBe(6);
  await expect(
    page.getByRole("region", { name: "Session activity site" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Next ask · 6" })
  ).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "Recenter realm" }).click();
  // Let the caption layer's bounded 250ms synchronization observe the new zoom.
  await page.waitForTimeout(350);
  await expect(
    page.getByRole("region", { name: "Session activity site" })
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("busy-compact.png") });
  await page.getByRole("button", { name: "Next ask · 6" }).click();
  await expect(
    page.getByRole("region", { name: "Session activity site" })
  ).toBeVisible();
});
