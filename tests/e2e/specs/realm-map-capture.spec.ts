import { test, expect } from "../fixtures/electron";
import {
  seedWorldCommand,
  waitForRealmkeeper,
  type RwE2eWindow,
} from "../helpers/app";

test("finds blocked agents and reopens collapsed alerts without approving requests", async ({
  appPage: page,
}, testInfo) => {
  await waitForRealmkeeper(page);
  await expect(
    page.getByRole("button", { name: "No pending asks" })
  ).toBeDisabled();
  await page.getByText("Realm guide", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Realm controls and meanings" })
  ).toBeVisible();
  await page.getByText("Realm guide", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Realm controls and meanings" })
  ).toBeHidden();
  await seedWorldCommand(page);
  await page.getByRole("button", { name: "Close world command" }).click();
  const visited = new Set<string>();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Collapse Alerts" }).click();
    await page.getByRole("button", { name: "Next ask · 2" }).click();
    await expect(
      page.getByRole("region", { name: "Session activity site" })
    ).toBeVisible();
    const close = page.getByRole("button", { name: /^Close (Mira|Vaelen)/ });
    visited.add((await close.getAttribute("aria-label"))!);
    await page.getByRole("button", { name: "Review blocking ask" }).click();
    await expect(
      page.getByRole("button", { name: "Collapse Alerts" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next ask · 2" })
    ).toBeVisible();
    await close.click();
  }
  expect(visited.size).toBe(2);
  await page.getByRole("button", { name: "Recenter realm" }).click();
  await page.waitForTimeout(350);
  // Click the character itself; its status caption is hidden at overview zoom.
  const character = await page.evaluate(() => {
    const scene = (
      window as unknown as {
        __phaser: {
          scene: {
            getScene(key: string): {
              worlds: Map<
                string,
                {
                  wielders: Map<
                    string,
                    { container: { x: number; y: number } }
                  >;
                }
              >;
              cameras: {
                main: { zoom: number; worldView: { x: number; y: number } };
              };
            };
          };
        };
      }
    ).__phaser.scene.getScene("kingdom");
    const ref = [...scene.worlds.values()]
      .flatMap((w) => [...w.wielders.entries()])
      .find(([id]) => id === "qa-aurelia")?.[1];
    if (!ref) throw new Error("Expected Aurelia on the rendered map");
    const camera = scene.cameras.main;
    return {
      x: (ref.container.x - camera.worldView.x) * camera.zoom,
      y: (ref.container.y - 20 - camera.worldView.y) * camera.zoom,
    };
  });
  await page.mouse.click(character.x, character.y);
  await expect(
    page.getByRole("region", { name: "Session activity site" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Close Aurelia/ })
  ).toBeVisible();
  await expect(
    page.getByText("No explicitly linked run. Showing session activity only.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Focus agent in Realm" }).click();
  await expect(
    page.getByRole("button", { name: /^Close Aurelia/ })
  ).toHaveCount(1);
  const inspectorOpacity = await page
    .getByRole("region", { name: "Session activity site" })
    .evaluate((element) => {
      let opacity = 1;
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        opacity *= Number(getComputedStyle(node).opacity);
      }
      return opacity;
    });
  expect(inspectorOpacity).toBe(1);
  for (const width of [1400, 1024]) {
    await page.setViewportSize({ width, height: width === 1024 ? 768 : 900 });
    await page.getByRole("button", { name: "Focus agent in Realm" }).click();
    await page.waitForTimeout(500);
    const visibleBesidePanel = await page.evaluate(() => {
      const scene = (
        window as unknown as {
          __phaser: {
            scene: {
              getScene(key: string): {
                worlds: Map<
                  string,
                  {
                    wielders: Map<
                      string,
                      { container: { x: number; y: number } }
                    >;
                  }
                >;
                cameras: {
                  main: { zoom: number; worldView: { x: number; y: number } };
                };
              };
            };
          };
        }
      ).__phaser.scene.getScene("kingdom");
      const actor = [...scene.worlds.values()]
        .flatMap((w) => [...w.wielders.entries()])
        .find(([id]) => id === "qa-aurelia")?.[1];
      if (!actor) return false;
      const camera = scene.cameras.main;
      const x = (actor.container.x - camera.worldView.x) * camera.zoom;
      const y = (actor.container.y - 24 - camera.worldView.y) * camera.zoom;
      const panel = document
        .querySelector('[role="dialog"][aria-label^="Aurelia"]')
        ?.getBoundingClientRect();
      return (
        !!panel &&
        x > 24 &&
        x < innerWidth - 24 &&
        y > 100 &&
        y < innerHeight - 100 &&
        (x + 24 < panel.left || x - 24 > panel.right)
      );
    });
    expect(visibleBesidePanel).toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath("direct-agent-inspection.png"),
  });
});

test("world commands remain clickable and the map renders at two scales", async ({
  appPage: page,
}, testInfo) => {
  await waitForRealmkeeper(page);
  await seedWorldCommand(page);
  await page.getByRole("button", { name: "Close world command" }).click();
  await expect(
    page.getByRole("button", { name: "Close world command" })
  ).toBeHidden();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1000);
  await testInfo.attach("settlement-view", {
    body: await page.screenshot({
      path: testInfo.outputPath("settlement.png"),
    }),
    contentType: "image/png",
  });
  await page.mouse.move(700, 450);
  for (let i = 0; i < 16; i++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Recenter realm" }).click();
  await page.waitForTimeout(250);
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (
          window as unknown as {
            __phaser: {
              scene: {
                getScene(key: string): {
                  activitySites: {
                    markers: Map<
                      string,
                      {
                        text: {
                          visible: boolean;
                          scaleY: number;
                          getBounds(): {
                            x: number;
                            y: number;
                            width: number;
                            height: number;
                          };
                        };
                      }
                    >;
                  };
                  tacticalMapState: {
                    screenX: number;
                    screenY: number;
                    layout: { width: number; height: number };
                  };
                  cameras: {
                    main: { zoom: number; worldView: { x: number; y: number } };
                  };
                };
              };
            };
          }
        ).__phaser.scene.getScene("kingdom");
        const marker = scene.activitySites.markers.get("session:qa-mira");
        if (!marker?.text.visible) return false;
        const bounds = marker.text.getBounds();
        const camera = scene.cameras.main;
        const x = (bounds.x - camera.worldView.x) * camera.zoom;
        const y = (bounds.y - camera.worldView.y) * camera.zoom;
        const width = bounds.width * camera.zoom;
        const height = bounds.height * camera.zoom;
        const map = scene.tacticalMapState;
        return (
          10 * marker.text.scaleY * camera.zoom >= 11.9 &&
          (x + width <= map.screenX - 5 ||
            x >= map.screenX + map.layout.width + 5 ||
            y + height <= map.screenY - 5 ||
            y >= map.screenY + map.layout.height + 5)
        );
      })
    )
    .toBe(true);
  await testInfo.attach("overview", {
    body: await page.screenshot({ path: testInfo.outputPath("overview.png") }),
    contentType: "image/png",
  });
  // The amber activity site opens session evidence, not a district or an approval.
  await page.mouse.click(621, 684);
  await expect(
    page.getByRole("region", { name: "Session activity site" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review blocking ask" })
  ).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: testInfo.outputPath("activity-inspector.png"),
  });
  await page.getByRole("button", { name: /^Close Mira/ }).click();
  // Select a real courtyard from the rendered overview, not through the store.
  await page.mouse.click(675, 240);
  await expect(
    page.getByRole("region", { name: "Crown Citadel Archive world command" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Close world command" }).click();
  await page.getByRole("button", { name: "Expand HUD" }).click();
  await expect(
    page.getByRole("button", { name: "Compact HUD" })
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Compact HUD" }).click();
  await expect(
    page.getByRole("button", { name: "Expand Wielders" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand Wielders" }).click();
  await expect(
    page.getByRole("button", { name: "Dispatch a wielder" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Collapse Wielders" }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.mouse.move(960, 500);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Recenter realm" }).click();
  await page.waitForTimeout(250);
  await testInfo.attach("wide-overview", {
    body: await page.screenshot({
      path: testInfo.outputPath("wide-overview.png"),
    }),
    contentType: "image/png",
  });
  // Exercise exploration, not just a stationary overview. Drags must not
  // accidentally select a district, and recenter must recover the landscape.
  await page.mouse.move(960, 500);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -200);
  await page.mouse.down();
  await page.mouse.move(320, 760, { steps: 20 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Close world command" })
  ).toBeHidden();
  await page.waitForTimeout(250);
  await page.screenshot({ path: testInfo.outputPath("exploration.png") });
  await page.getByRole("button", { name: "Recenter realm" }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "Recenter realm" }).click();
  await page.waitForTimeout(350);
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("compact-window.png") });
});

test("explicit run sites remain inspectable through lifecycle changes", async ({
  appPage: page,
}, testInfo) => {
  await waitForRealmkeeper(page);
  await seedWorldCommand(page);
  await page.getByRole("button", { name: "Close world command" }).click();
  await page.evaluate(async () => {
    await (window as unknown as RwE2eWindow).rw.createOrchestrationRun({
      id: "realm-run-site-e2e",
      template: "manual-e2e-control",
      title: "Review login flow",
      repoRoot: "/tmp/realmkeeper-qa/citadel-castle",
      status: "paused",
    });
  });
  await page.waitForFunction(
    () =>
      (window as unknown as RwE2eWindow).__rwStore?.getState()
        .orchestrationRuns["realm-run-site-e2e"]?.status === "paused"
  );
  await page.mouse.move(700, 450);
  for (let i = 0; i < 16; i++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath("run-sites.png") });
  await page.getByRole("button", { name: "Recenter realm" }).click();
  await page.waitForTimeout(250);
  await page.mouse.click(785, 224);
  const inspector = page.getByRole("region", {
    name: "Run worksite inspector",
  });
  await expect(inspector).toBeVisible();
  await expect(
    inspector.getByText("Review login flow", { exact: true })
  ).toBeVisible();
  await expect(inspector.getByText("paused", { exact: true })).toBeVisible();
  await expect(
    inspector.getByText(/No linked session is currently visible/)
  ).toBeVisible();
  await page.evaluate(async () => {
    await (window as unknown as RwE2eWindow).rw.controlOrchestrationRun({
      runId: "realm-run-site-e2e",
      action: "complete",
    });
  });
  await expect(inspector.getByText("completed", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: testInfo.outputPath("run-inspector.png") });
});
