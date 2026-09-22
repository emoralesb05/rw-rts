import { test, expect } from "../fixtures/electron";
import { seedWorldCommand, waitForRealmkeeper } from "../helpers/app";
import type { WorldState } from "../../../src/shared/events";

type TerrainWorld = {
  container: { x: number; y: number };
  wielders: Map<
    string,
    {
      courtyardIndex: number;
      isTraveling: boolean;
      container: { x: number; y: number };
    }
  >;
};

type TerrainWindow = Window & {
  __rwStore: {
    getState(): { worlds: Record<string, WorldState> };
    setState(state: { worlds: Record<string, WorldState> }): void;
  };
  __phaser: {
    scene: {
      getScene(key: string): {
        worlds: Map<string, TerrainWorld>;
        terrainJoins: { joins: Map<string, unknown> };
        layout: Map<string, { x: number; y: number }>;
        courtyardFor(
          world: TerrainWorld,
          slot: number
        ): { x: number; y: number };
        terrainRegions: Map<
          number,
          {
            frame: { name: string | number };
            displayWidth: number;
            displayHeight: number;
          }
        >;
        cameras: {
          main: {
            setZoom(zoom: number): void;
            centerOn(x: number, y: number): void;
            panEffect: { reset(): void };
            zoomEffect: { reset(): void };
          };
        };
      };
    };
  };
};

test("renders connected terrain across horizontal and vertical region boundaries", async ({
  appPage: page,
}, testInfo) => {
  await waitForRealmkeeper(page);
  await seedWorldCommand(page);
  await page.getByRole("button", { name: "Close world command" }).click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = (
            window as unknown as TerrainWindow
          ).__phaser.scene.getScene("kingdom");
          const refs = [...scene.worlds.values()].flatMap((world) => [
            ...world.wielders.values(),
          ]);
          const worlds = (
            window as unknown as TerrainWindow
          ).__rwStore.getState().worlds;
          const expected = Object.values(worlds).reduce(
            (count, world) => count + world.unitIds.length,
            0
          );
          return (
            expected > 0 &&
            refs.length === expected &&
            refs.every((ref) => !ref.isTraveling)
          );
        }),
      { timeout: 15_000 }
    )
    .toBe(true);
  const relocationGlitches = await page.evaluate(async () => {
    const store = (window as unknown as TerrainWindow).__rwStore;
    const worlds = { ...store.getState().worlds };
    const template = Object.values(worlds)[0];
    for (let i = 0; i < 18; i++) {
      const id = `qa-join-${i}`;
      worlds[id] = {
        ...template,
        id,
        label: `Join fixture ${i}`,
        path: `/qa/join-${i}`,
        unitIds: [],
        alertLevel: "idle",
        riftling: [],
        glimmer: 0,
      };
    }
    store.setState({ worlds });
    const scene = (window as unknown as TerrainWindow).__phaser.scene.getScene(
      "kingdom"
    );
    const glitches: string[] = [];
    for (let frame = 0; frame < 45; frame++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      if (scene.terrainRegions.size !== 6) continue;
      for (const [id, world] of scene.worlds) {
        const target = scene.layout.get(id)!;
        if (world.container.x !== target.x || world.container.y !== target.y)
          glitches.push(
            `frame ${frame}: district ${id} sliding outside courtyard`
          );
        for (const [agentId, ref] of world.wielders) {
          const court = scene.courtyardFor(world, ref.courtyardIndex);
          if (
            Math.abs(ref.container.x - court.x) > 130 ||
            ref.container.y < court.y - 12 ||
            ref.container.y > court.y + 150
          )
            glitches.push(`frame ${frame}: agent ${agentId} outside courtyard`);
        }
      }
    }
    return glitches;
  });
  expect(relocationGlitches).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as TerrainWindow).__phaser.scene.getScene(
            "kingdom"
          ).terrainRegions.size
      )
    )
    .toBe(6);
  const tiles = await page.evaluate(() =>
    [
      ...(window as unknown as TerrainWindow).__phaser.scene
        .getScene("kingdom")
        .terrainRegions.values(),
    ].map((tile) => ({
      frame: tile.frame.name,
      width: tile.displayWidth,
      height: tile.displayHeight,
    }))
  );
  for (const tile of tiles) {
    expect(tile.frame).toBe("__BASE");
    expect(tile.width).toBeCloseTo(1536 * 1.35);
    expect(tile.height).toBeCloseTo(1024 * 1.35);
  }
  for (const [name, zoom, x, y] of [
    ["junction-close", 1.1, 1536, 1024],
    ["junction-overview", 0.6, 1536, 1024],
    ["east-road", 1.1, 1536, 512],
    ["south-road", 1.1, 768, 1024],
  ] as const) {
    await page.evaluate(
      ({ zoom, x, y }) => {
        const camera = (
          window as unknown as TerrainWindow
        ).__phaser.scene.getScene("kingdom").cameras.main;
        camera.panEffect.reset();
        camera.zoomEffect.reset();
        camera.setZoom(zoom);
        camera.centerOn((x - 750) * 1.35, (y - 480) * 1.35);
      },
      { zoom, x, y }
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  }
  // Removing the fixture districts must also clean up joins and relocate the
  // original agents, including the failed session, back onto their courtyards.
  await page.evaluate(() => {
    const store = (window as unknown as TerrainWindow).__rwStore;
    store.setState({
      worlds: Object.fromEntries(
        Object.entries(store.getState().worlds).filter(
          ([id]) => !id.startsWith("qa-join-")
        )
      ),
    });
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (
          window as unknown as TerrainWindow
        ).__phaser.scene.getScene("kingdom");
        if (
          scene.terrainRegions.size !== 1 ||
          scene.terrainJoins.joins.size !== 0
        )
          return false;
        return [...scene.worlds.values()].every((world) =>
          [...world.wielders.values()].every((ref) => {
            const court = scene.courtyardFor(world, ref.courtyardIndex);
            return (
              Math.abs(ref.container.x - court.x) <= 130 &&
              ref.container.y >= court.y - 12 &&
              ref.container.y <= court.y + 150
            );
          })
        );
      })
    )
    .toBe(true);
});
