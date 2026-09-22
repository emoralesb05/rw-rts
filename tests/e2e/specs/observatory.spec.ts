import type { Locator } from "@playwright/test";
import { expect, test } from "../fixtures/electron";
import { playFixture, waitForRealmkeeper } from "../helpers/app";

function kingdomSection(kingdom: Locator, title: string): Locator {
  return kingdom.locator("section", { hasText: title }).first();
}

test("shows fixture trace health in the Observatory tab", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);

  await playFixture(page, "codex-shell");
  await playFixture(page, "permission-claude");
  await playFixture(page, "orchestration-error-pause");

  await page.getByRole("button", { name: "Open Kingdom panel" }).click();
  const kingdom = page.getByRole("dialog", { name: "Kingdom" });
  await expect(kingdom).toBeVisible();

  await kingdom.getByRole("tab", { name: /observatory/i }).click();
  await expect(kingdom.getByText("Trace export")).toBeVisible();

  const waits = kingdomSection(kingdom, "Active waits");
  const waitRow = waits
    .getByRole("listitem")
    .filter({ hasText: /claude-permi/i });
  await expect(waitRow).toBeVisible();
  await expect(waitRow).toContainText("permission");

  const errors = kingdomSection(kingdom, "Recent errors");
  await expect(
    errors.getByText("orchestration fixture provider error")
  ).toBeVisible();

  const signals = kingdomSection(kingdom, "Monitor signals");
  await expect(signals.getByText("Trace error")).toBeVisible();
  await expect(
    signals.getByText("orchestration fixture provider error")
  ).toBeVisible();

  const sessions = kingdomSection(kingdom, "Trace sessions");
  await expect(
    sessions.getByText(/codex · \d+ spans · completed/i)
  ).toBeVisible();
  await expect(
    sessions.getByText(/claude · \d+ spans · active/i)
  ).toBeVisible();
  await expect(sessions.getByText(/claude · \d+ spans · error/i)).toBeVisible();

  await expect(
    kingdom.getByText(/Completed traces: [1-9]\d*\. Error traces: [1-9]\d*\./)
  ).toBeVisible();
});
