import { expect, test } from "../fixtures/electron";
import { playFixture, waitForRealmkeeper } from "../helpers/app";

test("surfaces live agents and blocking work in the Monitor workspace", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);
  await page.getByRole("button", { name: "Monitor" }).click();

  await expect(page.getByRole("heading", { name: "Attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fleet" })).toBeVisible();
  await expect(page.getByText("No agents observed yet")).toBeVisible();

  await playFixture(page, "summon-all");
  await expect(page.getByText(/4 agents/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /vaelens-grove/i })
  ).toBeVisible();
  await expect(page.getByText("Session started").first()).toBeVisible();

  await playFixture(page, "permission-claude");
  const permission = page.getByRole("button", { name: /Permission needed/i });
  await expect(permission).toBeVisible();
  await permission.click();

  await expect(
    page.getByText("Waiting for permission", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Permission decision required", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText(/realmkeeper-events/i).first()).toBeVisible();

  await page.getByLabel("State").selectOption("blocked");
  await expect(page.getByRole("button", { name: /blocked/i })).toHaveCount(1);
  await page.getByLabel("Filter agents").fill("no matching agent");
  await expect(page.getByText("No matching agents")).toBeVisible();
  await page.getByLabel("Filter agents").fill("");
  await page.getByLabel("State").selectOption("all");

  await page.getByRole("button", { name: "Realm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Kingdom panel" })
  ).toBeVisible();
});
