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

test("sends chat follow-ups through Realmkeeper prompt IPC", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);
  await playFixture(page, "cursor-turn");
  await waitForTools(page, ["cursor"]);

  await page
    .getByRole("button", { name: /Open chat with /i })
    .first()
    .click();
  const chatDrawer = page.getByRole("complementary", {
    name: "Wielder chats",
  });
  await expect(chatDrawer).toBeVisible();
  // `playFixture` streams asynchronously. Wait for the fixture's initial
  // prompt so our follow-up is not mistaken for an interrupted prompt when
  // that scripted prompt arrives on faster or slower Electron runtimes.
  await expect(chatDrawer.getByText("rename App to KhApp")).toBeVisible();

  const prompt = "Please summarize the fixture follow-up.";
  const input = page.getByPlaceholder(/Message .+⌘↵ to send/i);
  await input.fill(prompt);
  await chatDrawer.getByRole("button", { name: /^Send message to /i }).click();

  await expect(input).toHaveValue("");
  await expect(chatDrawer.getByText("via Realmkeeper")).toBeVisible();
  await expect(chatDrawer.getByText(prompt)).toBeVisible();
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

test("surfaces Codex decline-only MCP elicitation letters", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);
  await playFixture(page, "codex-decline-only-inputs");

  const urlCard = alertCard(page, "https://example.com/oauth");
  const formCard = alertCard(page, "Mode: openai/form.");

  await expect(urlCard).toBeVisible();
  await expect(urlCard.getByRole("button", { name: /^accept$/i })).toHaveCount(
    0
  );
  await expect(
    urlCard.getByRole("button", { name: /^decline$/i })
  ).toBeVisible();
  await expect(
    urlCard.getByRole("button", { name: /^cancel$/i })
  ).toBeVisible();

  await expect(formCard).toBeVisible();
  await expect(formCard.getByText("fixture-form")).toBeVisible();
  await expect(formCard.getByRole("button", { name: /^accept$/i })).toHaveCount(
    0
  );
  await expect(
    formCard.getByRole("button", { name: /^decline$/i })
  ).toBeVisible();
  await expect(
    formCard.getByRole("button", { name: /^cancel$/i })
  ).toBeVisible();

  await urlCard.getByRole("button", { name: /^cancel$/i }).click();
  await expect(urlCard).toBeHidden();

  await formCard.getByRole("button", { name: /^decline$/i }).click();
  await expect(formCard).toBeHidden();
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
