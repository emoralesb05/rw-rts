import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/electron";
import {
  playFixture,
  waitForRealmkeeper,
  waitForTools,
  type ProviderTool,
} from "../helpers/app";

function alertCard(page: Page, text: string) {
  return page
    .locator(".hud-top-right [data-letter-request-id]")
    .filter({ hasText: text })
    .first();
}

test("renders activity for all provider fixture turns", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);

  await playFixture(page, "claude-question");
  await playFixture(page, "cursor-turn");
  await playFixture(page, "codex-shell");
  await playFixture(page, "gemini-turn");

  await waitForTools(page, ["claude", "cursor", "codex", "gemini"]);

  const wielders = page.getByRole("region", { name: "Wielders" });
  for (const label of ["Claude", "Cursor", "Codex", "Gemini"]) {
    await expect(wielders.getByText(label).first()).toBeVisible();
  }

  await expect(
    page.getByText("Which implementation style should Claude use?")
  ).toBeVisible();
});

test("submits Codex user-input and MCP elicitation letters", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);
  await playFixture(page, "codex-inputs");

  const answerCard = alertCard(
    page,
    "Which implementation style should Codex use?"
  );
  const mcpCard = alertCard(
    page,
    "Which repository should the MCP server use?"
  );

  await expect(answerCard).toBeVisible();
  await expect(mcpCard).toBeVisible();

  await answerCard.getByRole("radio", { name: "Small" }).click();
  await answerCard.locator("textarea").fill("Keep the fixture scoped.");
  await answerCard.getByRole("button", { name: "send answer" }).click();
  await expect(answerCard).toBeHidden();

  await mcpCard.getByRole("radio", { name: "Realmkeeper" }).click();
  await mcpCard.getByRole("checkbox", { name: "Provider" }).click();
  await mcpCard.getByRole("radio", { name: "Yes" }).click();
  await mcpCard.getByRole("button", { name: "accept" }).click();
  await expect(mcpCard).toBeHidden();
});

const actionablePermissionCases: {
  tool: Exclude<ProviderTool, "cursor">;
  scenario: string;
  body: string;
}[] = [
  {
    tool: "claude",
    scenario: "permission-claude",
    body: "rm -rf /tmp/dangerous-test-junk",
  },
  {
    tool: "codex",
    scenario: "permission-codex",
    body: "git status --short",
  },
  {
    tool: "gemini",
    scenario: "permission-gemini",
    body: "notes/gemini-provider-check.md",
  },
];

for (const { tool, scenario, body } of actionablePermissionCases) {
  test(`${tool} permission fixture is actionable from Realmkeeper`, async ({
    appPage: page,
  }) => {
    await waitForRealmkeeper(page);
    await playFixture(page, scenario);

    const card = alertCard(page, body);
    await expect(card).toBeVisible();
    await expect(card.getByLabel("Deny reason")).toBeVisible();
    await expect(card.getByRole("button", { name: /^allow$/i })).toBeVisible();
    await expect(card.getByRole("button", { name: /^deny$/i })).toBeVisible();

    await card.getByRole("button", { name: /^deny$/i }).click();
    await expect(card).toBeHidden();
  });
}

test("cursor permission fixture is observe-only", async ({ appPage: page }) => {
  await waitForRealmkeeper(page);
  await playFixture(page, "permission-cursor");

  const card = alertCard(page, "bun run typecheck");
  await expect(card).toBeVisible();
  await expect(card.getByText(/approve in Cursor's UI/i)).toBeVisible();
  await expect(card.getByLabel("Deny reason")).toHaveCount(0);
  await expect(card.getByRole("button", { name: /^allow$/i })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /^deny$/i })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /^ack$/i })).toBeVisible();

  await card.getByRole("button", { name: /^ack$/i }).click();
  await expect(card).toBeHidden();
});
