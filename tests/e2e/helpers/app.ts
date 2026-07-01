import type { Locator, Page } from "@playwright/test";
import { expect } from "../fixtures/electron";

export type ProviderTool = "claude" | "cursor" | "codex" | "gemini";

export type RwE2eWindow = Window & {
  rw: {
    playFixture(req: { scenario: string; cwd?: string }): Promise<void>;
  };
  __rwSeedVisualQa?: () => { activeWorldId: string | null };
  __rwStore?: {
    getState(): {
      units: Record<string, { tool: ProviderTool }>;
      setWorldCommandAnchor(anchor: {
        worldId: string;
        x: number;
        y: number;
        worldX: number;
        worldY: number;
        visible: boolean;
      }): void;
    };
  };
};

export type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

export async function waitForRealmkeeper(page: Page) {
  await page.waitForFunction(
    () =>
      typeof (window as unknown as RwE2eWindow).rw?.playFixture === "function"
  );
  await expect(page).toHaveTitle(/Realmkeeper/);
}

export async function playFixture(page: Page, scenario: string) {
  await page.evaluate(async (fixtureScenario) => {
    await (window as unknown as RwE2eWindow).rw.playFixture({
      scenario: fixtureScenario,
    });
  }, scenario);
}

export async function waitForTools(page: Page, tools: readonly ProviderTool[]) {
  await page.waitForFunction((expectedTools) => {
    const store = (window as unknown as RwE2eWindow).__rwStore?.getState();
    if (!store) return false;
    const activeTools = new Set(
      Object.values(store.units).map((unit) => unit.tool)
    );
    return expectedTools.every((tool) => activeTools.has(tool));
  }, tools);
}

export async function seedWorldCommand(page: Page) {
  await page.evaluate(() => {
    const rwWindow = window as unknown as RwE2eWindow;
    const seed = rwWindow.__rwSeedVisualQa?.();
    const store = rwWindow.__rwStore?.getState();
    if (!seed?.activeWorldId || !store) {
      throw new Error("Realmkeeper E2E debug hooks are unavailable");
    }
    store.setWorldCommandAnchor({
      worldId: seed.activeWorldId,
      x: 180,
      y: 120,
      worldX: 0,
      worldY: 0,
      visible: true,
    });
  });
}

export async function requiredBox(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box as Box;
}

export function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
