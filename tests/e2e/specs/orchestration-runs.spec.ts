import { expect, test } from "../fixtures/electron";
import { waitForRealmkeeper, type RwE2eWindow } from "../helpers/app";

const RUN_ID = "e2e-run-board-manual-control";
const RUN_TEMPLATE = "manual-e2e-control";
const RUN_TITLE = "Manual Control - E2E durable run";

test("controls durable orchestration runs from the Run board", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);

  await page.evaluate(
    async ({ id, template, title }) => {
      await (window as unknown as RwE2eWindow).rw.createOrchestrationRun({
        id,
        title,
        template,
        params: {
          sourceTraceId: "trace-e2e",
          handoffPrompt: "Review the fixture result.",
        },
        budget: {
          maxIterations: 2,
          maxConsecutiveFailures: 1,
          maxRuntimeMs: 60_000,
        },
        status: "running",
      });
    },
    { id: RUN_ID, template: RUN_TEMPLATE, title: RUN_TITLE }
  );

  await page.getByRole("button", { name: "Open Kingdom panel" }).click();
  const kingdom = page.getByRole("dialog", { name: "Kingdom" });
  await expect(kingdom).toBeVisible();

  await kingdom.getByRole("tab", { name: /runs/i }).click();
  await expect(kingdom.getByText("Run board")).toBeVisible();

  const row = kingdom
    .getByRole("listitem")
    .filter({ hasText: RUN_TITLE })
    .first();
  await expect(row).toBeVisible();
  await expect(row.getByText(RUN_TEMPLATE)).toBeVisible();
  await expect(row.getByText("running", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: `Pause run ${RUN_TITLE}` }).click();
  await expect(row.getByText("paused", { exact: true })).toBeVisible();
  await expect(row.getByText("Paused from Run Board.")).toBeVisible();

  await row.getByRole("button", { name: `Resume run ${RUN_TITLE}` }).click();
  await expect(row.getByText("running", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: `Stop run ${RUN_TITLE}` }).click();
  await expect(row.getByText("stopped", { exact: true })).toBeVisible();

  const storedStatus = await page.evaluate(async (id) => {
    const runs = await (
      window as unknown as RwE2eWindow
    ).rw.listOrchestrationRuns();
    return runs.find((run) => run.id === id)?.status;
  }, RUN_ID);
  expect(storedStatus).toBe("stopped");
});

test("creates queued orchestration runs from the Run board", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);

  await page.getByRole("button", { name: "Open Kingdom panel" }).click();
  const kingdom = page.getByRole("dialog", { name: "Kingdom" });
  await expect(kingdom).toBeVisible();

  await kingdom.getByRole("tab", { name: /runs/i }).click();
  await kingdom
    .getByRole("button", { name: "Create Provider Handoff Review run" })
    .click();

  const row = kingdom
    .getByRole("listitem")
    .filter({ hasText: "Provider Handoff Review draft" })
    .first();
  await expect(row).toBeVisible();
  await expect(row.getByText("provider-handoff-review")).toBeVisible();
  await expect(row.getByText("queued", { exact: true })).toBeVisible();
});
