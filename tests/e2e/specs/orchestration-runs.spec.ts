import { expect, test } from "../fixtures/electron";
import {
  playFixture,
  waitForRealmkeeper,
  waitForTools,
  type RwE2eWindow,
} from "../helpers/app";

const RUN_ID = "e2e-run-board-manual-control";
const RUN_TEMPLATE = "manual-e2e-control";
const RUN_TITLE = "Manual Control - E2E durable run";

async function fixtureTarget(
  page: Parameters<typeof waitForRealmkeeper>[0],
  sessionPrefix: string
) {
  await page.waitForFunction((prefix) => {
    const store = (window as unknown as RwE2eWindow).__rwStore?.getState();
    return Object.values(store?.units ?? {}).some((item) =>
      item.sessionId.startsWith(prefix)
    );
  }, sessionPrefix);
  return page.evaluate((prefix) => {
    const store = (window as unknown as RwE2eWindow).__rwStore?.getState();
    const unit = Object.values(store?.units ?? {}).find((item) =>
      item.sessionId.startsWith(prefix)
    );
    if (!unit) throw new Error(`Missing fixture unit ${prefix}`);
    return {
      unitId: unit.id,
      sessionId: unit.sessionId,
      tool: unit.tool,
      cwd: unit.cwd,
      status: unit.status,
    };
  }, sessionPrefix);
}

async function waitForRunStatus(
  page: Parameters<typeof waitForRealmkeeper>[0],
  runId: string,
  status: string
) {
  await expect
    .poll(async () =>
      page.evaluate(async (id) => {
        const runs = await (
          window as unknown as RwE2eWindow
        ).rw.listOrchestrationRuns();
        return runs.find((run) => run.id === id)?.status ?? null;
      }, runId)
    )
    .toBe(status);
}

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

test("completes recurring Standing Order runs in the packaged app path", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);
  await playFixture(page, "summon-vaelen");
  await waitForTools(page, ["claude"]);
  const target = await fixtureTarget(page, "summon-warden1-");
  const runId = "e2e-standing-order-completes";

  await page.evaluate(
    async ({ id, params }) => {
      await (window as unknown as RwE2eWindow).rw.createOrchestrationRun({
        id,
        title: "E2E Standing Order completes",
        template: "standing-order",
        status: "running",
        params: {
          ...params,
          prompt: "send a synthetic standing-order tick",
          intervalMs: 60_000,
        },
        budget: {
          maxIterations: 1,
          maxConsecutiveFailures: 1,
          maxRuntimeMs: 60_000,
        },
      });
    },
    { id: runId, params: target }
  );

  await waitForRunStatus(page, runId, "completed");
});

test("pauses orchestration runs for budget, provider errors, and asks", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);

  await page.evaluate(async () => {
    await (window as unknown as RwE2eWindow).rw.createOrchestrationRun({
      id: "e2e-budget-pause",
      title: "E2E budget pause",
      template: "standing-order",
      status: "running",
      budget: { maxRuntimeMs: 0 },
    });
  });
  await waitForRunStatus(page, "e2e-budget-pause", "paused");

  await playFixture(page, "orchestration-error-pause");
  const errorTarget = await fixtureTarget(page, "orchestration-error-e2e");
  await page.evaluate(
    async ({ params }) => {
      await (window as unknown as RwE2eWindow).rw.createOrchestrationRun({
        id: "e2e-provider-error-pause",
        title: "E2E provider error pause",
        template: "provider-handoff-review",
        status: "running",
        params: {
          target: params,
          handoffPrompt: "Wait for fixture provider error.",
        },
      });
    },
    { params: errorTarget }
  );
  await waitForRunStatus(page, "e2e-provider-error-pause", "paused");

  await playFixture(page, "orchestration-permission-pause");
  const permissionTarget = await fixtureTarget(
    page,
    "orchestration-permission-request-e2e"
  );
  await page.evaluate(
    async ({ params }) => {
      await (window as unknown as RwE2eWindow).rw.createOrchestrationRun({
        id: "e2e-permission-pause",
        title: "E2E permission pause",
        template: "provider-handoff-review",
        status: "running",
        params: {
          target: params,
          handoffPrompt: "Wait for fixture permission.",
        },
      });
    },
    { params: permissionTarget }
  );
  await waitForRunStatus(page, "e2e-permission-pause", "paused");

  await playFixture(page, "orchestration-input-pause");
  const inputTarget = await fixtureTarget(
    page,
    "orchestration-user-input-request-e2e"
  );
  await page.evaluate(
    async ({ params }) => {
      await (window as unknown as RwE2eWindow).rw.createOrchestrationRun({
        id: "e2e-user-input-pause",
        title: "E2E user input pause",
        template: "fix-then-test",
        status: "running",
        params: {
          target: params,
          taskPrompt: "Wait for fixture input.",
          verificationCommand: "bun run test",
        },
      });
    },
    { params: inputTarget }
  );
  await waitForRunStatus(page, "e2e-user-input-pause", "paused");

  const pauseReasons = await page.evaluate(async () => {
    const runs = await (
      window as unknown as RwE2eWindow
    ).rw.listOrchestrationRuns();
    return Object.fromEntries(
      runs.map((run) => [run.id, run.pauseReason ?? ""])
    );
  });
  expect(pauseReasons["e2e-budget-pause"]).toContain(
    "Run exceeded runtime budget"
  );
  expect(pauseReasons["e2e-provider-error-pause"]).toContain(
    "Provider emitted an error"
  );
  expect(pauseReasons["e2e-permission-pause"]).toBe(
    "Paused for provider permission request."
  );
  expect(pauseReasons["e2e-user-input-pause"]).toBe(
    "Paused for provider user input request."
  );
});

test("creates queued orchestration runs from the Run board", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);
  await playFixture(page, "summon-vaelen");
  await waitForTools(page, ["claude"]);

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
