import { expect, test } from "../fixtures/electron";
import { waitForRealmkeeper } from "../helpers/app";

test("keeps the Kingdom demos panel visually stable", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);

  await page.getByRole("button", { name: "Open Kingdom panel" }).click();
  const kingdom = page.getByRole("dialog", { name: "Kingdom" });
  await expect(kingdom).toBeVisible();

  await kingdom.getByRole("tab", { name: /demos/i }).click();
  await expect(
    kingdom.getByRole("button", { name: /Codex · answer letters/i })
  ).toBeVisible();

  await expect(kingdom).toHaveScreenshot("kingdom-demos-panel.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.01,
  });
});
