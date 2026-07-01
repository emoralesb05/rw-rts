import { expect, test } from "../fixtures/electron";
import {
  intersects,
  playFixture,
  requiredBox,
  seedWorldCommand,
  waitForRealmkeeper,
} from "../helpers/app";

test("covers the core Electron shell flows", async ({ appPage: page }) => {
  await waitForRealmkeeper(page);
  await expect(
    page.getByRole("button", { name: "Open Kingdom panel" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Open Kingdom panel" }).click();
  const kingdom = page.getByRole("dialog", { name: "Kingdom" });
  await expect(kingdom).toBeVisible();
  await expect(kingdom.getByText("No realms sealed yet.")).toBeVisible();

  await kingdom.getByRole("tab", { name: /settings/i }).click();
  await expect(kingdom.getByLabel("Workspace root")).toBeVisible();
  await expect(kingdom.getByLabel("Exclude patterns")).toBeVisible();

  await kingdom.getByRole("tab", { name: /connection/i }).click();
  await expect(
    kingdom.getByRole("heading", { name: /Claude Code hook bridge/i })
  ).toBeVisible();
  await expect(
    kingdom.getByRole("heading", { name: /Cursor hook bridge/i })
  ).toBeVisible();
  await expect(
    kingdom.getByRole("heading", { name: /Codex hook bridge/i })
  ).toBeVisible();
  await expect(
    kingdom.getByRole("heading", { name: /Gemini hook bridge/i })
  ).toBeVisible();
  await expect(
    kingdom.getByRole("heading", { name: /Saved permission rules/i })
  ).toBeVisible();

  await kingdom.getByRole("tab", { name: /demos/i }).click();
  await expect(
    kingdom.getByRole("button", { name: /Permission · approval letter/i })
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Kingdom" }).click();
  await expect(kingdom).toBeHidden();

  await page.getByRole("button", { name: "Dispatch a wielder" }).click();
  const dispatch = page.getByRole("dialog", { name: "Dispatch" });
  await expect(dispatch).toBeVisible();
  const spawn = dispatch.getByRole("button", { name: /Spawn claude/i });
  await expect(spawn).toBeDisabled();
  await dispatch.getByLabel("Prompt").fill("smoke test prompt");
  await expect(spawn).toBeEnabled();
  await dispatch.getByRole("button", { name: "Cancel" }).click();
  await expect(dispatch).toBeHidden();

  await playFixture(page, "summon-vaelen");
  const openChat = page
    .getByRole("button", { name: /Open chat with /i })
    .first();
  await expect(openChat).toBeVisible();
  await openChat.click();
  const chatDrawer = page.getByRole("complementary", {
    name: "Wielder chats",
  });
  await expect(chatDrawer).toBeVisible();
  await expect(page.getByPlaceholder(/Message .+⌘↵ to send/i)).toBeVisible();

  await playFixture(page, "permission");
  await expect(page.getByText(/dangerous-test-junk/i)).toBeVisible();
  await page
    .getByRole("button", { name: /^deny$/i })
    .first()
    .click();
  await expect(page.getByText(/dangerous-test-junk/i)).toBeHidden();

  await seedWorldCommand(page);
  const worldCommand = page.getByRole("region", {
    name: /Crossroads Ward Ops world command/i,
  });
  await expect(worldCommand).toBeVisible();

  const worldCommandBox = await requiredBox(worldCommand);
  const wieldersBox = await requiredBox(
    page.getByRole("region", { name: "Wielders" })
  );
  const chatButtonBox = await requiredBox(
    page.getByRole("button", { name: /Open chat with Vaelen/i })
  );

  expect(intersects(worldCommandBox, wieldersBox)).toBe(false);
  expect(intersects(worldCommandBox, chatButtonBox)).toBe(false);
});
