import { expect, test } from "../fixtures/electron";
import { playFixture, waitForRealmkeeper } from "../helpers/app";
import { _electron as electron } from "@playwright/test";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import type {
  ControlSessionRequest,
  ControlSessionResponse,
  MonitorSnapshot,
} from "../../../src/shared/schemas";

test("reads and messages an agent and handles its request without leaving Monitor", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);
  await page.getByRole("button", { name: "Monitor", exact: true }).click();
  await playFixture(page, "cursor-turn");
  await page.getByRole("button", { name: "Open conversation" }).click();
  const conversation = page.getByRole("region", {
    name: "Agent conversation",
    exact: true,
  });
  await expect(conversation.getByText("rename App to KhApp")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fleet" })).toBeVisible();
  await expect(page.getByText(/Last signal:/).first()).toBeVisible();
  const message = "Please summarize the monitored fixture.";
  await conversation
    .getByRole("textbox", { name: "Message selected agent" })
    .fill(message);
  await conversation.getByRole("button", { name: "Send follow-up" }).click();
  await expect(conversation.getByText(message, { exact: true })).toBeVisible();
  await expect(
    conversation.getByRole("textbox", { name: "Message selected agent" })
  ).toHaveValue("");
  await expect(conversation.getByText(/re-ran typecheck/)).toBeVisible();
  await conversation.getByText("Model and approval settings").click();
  await expect(
    conversation.getByText(/Effective approval policy: not reported/)
  ).toBeVisible();
  await conversation.getByText("Model and approval settings").click();
  await page.screenshot({
    path: "/private/tmp/realmkeeper-agent-conversation.png",
  });

  await expect(
    conversation.getByRole("button", { name: "Resume with message" })
  ).toBeVisible();
  await expect(conversation.getByRole("textbox")).toBeEnabled();
  await conversation
    .getByRole("textbox")
    .fill("Continue this finished fixture.");
  await page.getByRole("button", { name: "Back to agent details" }).click();
  await page.getByRole("button", { name: "Open conversation" }).click();
  await expect(conversation.getByRole("textbox")).toHaveValue(
    "Continue this finished fixture."
  );
  const staleResume = await page.evaluate(async () => {
    const api = (
      window as unknown as {
        rw: { getMonitorSnapshot(): Promise<MonitorSnapshot> };
      }
    ).rw;
    const agent = (await api.getMonitorSnapshot()).agents.find(
      (entry) => entry.tool === "cursor"
    )!;
    return {
      action: "resume",
      unitId: agent.sourceLocalId ?? agent.nativeSessionId!,
      sessionId: agent.nativeSessionId,
      tool: "cursor",
      cwd: agent.cwd,
      prompt: "Must not duplicate",
      status: "complete",
    } satisfies ControlSessionRequest;
  });
  await conversation
    .getByRole("button", { name: "Resume with message" })
    .click();
  await expect(
    conversation.getByText("Continue this finished fixture.", { exact: true })
  ).toBeVisible();
  await expect(conversation.getByRole("textbox")).toHaveValue("");
  const rejected = await page.evaluate(
    (request) =>
      (
        window as unknown as {
          rw: {
            controlSession(
              request: ControlSessionRequest
            ): Promise<ControlSessionResponse>;
          };
        }
      ).rw.controlSession(request),
    staleResume
  );
  expect(rejected.ok).toBe(false);
  expect(rejected.reasonCode).toBe("capability_unavailable");

  await playFixture(page, "permission-claude");
  await page.getByRole("button", { name: /Permission needed/ }).click();
  await expect(conversation.getByText(message, { exact: true })).toHaveCount(0);
  await expect(
    conversation.getByRole("textbox", { name: "Message selected agent" })
  ).toBeDisabled();
  const request = conversation.locator("[data-letter-request-id]").first();
  await expect(request).toBeVisible();
  await request.getByRole("button", { name: "allow", exact: true }).click();
  await expect(request).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Fleet" })).toBeVisible();
});

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

  const alert = page.getByRole("article", { name: "Permission needed" });
  await alert.getByRole("button", { name: "Acknowledge" }).click();
  await expect(
    alert.getByText("Acknowledged · still unresolved")
  ).toBeVisible();
  await alert.getByRole("button", { name: "Snooze 15m" }).click();
  await expect(page.getByText("Snoozed (1)")).toBeVisible();

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
  // Realm starts from the same live snapshot, not a fresh event-age projection.
  await page.getByRole("button", { name: /Next ask/ }).click();
  const activity = page.getByRole("region", { name: "Session activity site" });
  await expect(activity.getByText("! Blocked", { exact: true })).toBeVisible();
  await expect(
    activity.getByText("Waiting for permission", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Monitor", exact: true }).click();
  await page.getByText("Snoozed (1)").click();
  await expect(
    page.getByRole("button", { name: /Permission needed/i })
  ).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/realmkeeper-attention-snoozed.png",
  });
  await page
    .getByRole("article", { name: "Permission needed" })
    .getByRole("button", { name: "Reopen" })
    .click();
  await expect(
    page
      .getByRole("article", { name: "Permission needed" })
      .getByRole("button", { name: "Acknowledge" })
  ).toBeVisible();
});

test("keeps restored blockers historical across an actual app restart", async ({
  appPage: page,
  electronApp,
}) => {
  await waitForRealmkeeper(page);
  await page.getByRole("button", { name: "Monitor", exact: true }).click();
  await playFixture(page, "permission-claude");
  await expect(
    page.getByRole("button", { name: /Permission needed/i })
  ).toBeVisible();
  const paths = await electronApp.evaluate(() => ({
    HOME: process.env.HOME!,
    REALMKEEPER_USER_DATA: process.env.REALMKEEPER_USER_DATA!,
  }));
  await page
    .getByRole("article", { name: "Permission needed" })
    .getByRole("button", { name: "Acknowledge" })
    .click();
  await expect(page.getByText("Acknowledged · still unresolved")).toBeVisible();
  const preferencesFile = join(
    paths.HOME,
    ".realmkeeper",
    "monitor",
    "attention.json"
  );
  const preferences = JSON.parse(readFileSync(preferencesFile, "utf8"));
  expect(preferences.choices).toHaveLength(1);
  await electronApp.close();
  const restarted = await electron.launch({
    ...(process.env.REALMKEEPER_E2E_EXECUTABLE
      ? {
          executablePath: resolve(process.env.REALMKEEPER_E2E_EXECUTABLE),
          args: [],
        }
      : { args: [join(process.cwd(), "out/main/index.js")] }),
    env: {
      ...process.env,
      ...paths,
      REALMKEEPER_E2E: "1",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });
  const errors: string[] = [];
  restarted.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  try {
    const next = await restarted.firstWindow();
    next.on("pageerror", (error) => errors.push(error.message));
    await next.setViewportSize({ width: 1400, height: 900 });
    await waitForRealmkeeper(next);
    await next.getByRole("button", { name: "Monitor", exact: true }).click();
    const history = next.getByRole("region", { name: "Monitoring history" });
    await expect(history.getByText(/Monitoring gap:/)).toBeVisible();
    await history.getByText(/Last seen history/).click();
    await expect(history.getByText(/Previously blocked/)).toBeVisible();
    await expect(
      next.getByRole("button", { name: /Permission needed/i })
    ).toHaveCount(0);
    const snapshot = await next.evaluate(() =>
      (
        window as unknown as {
          rw: { getMonitorSnapshot(): Promise<MonitorSnapshot> };
        }
      ).rw.getMonitorSnapshot()
    );
    expect(snapshot.agents).toEqual([]);
    expect(JSON.parse(readFileSync(preferencesFile, "utf8")).choices).toEqual(
      preferences.choices
    );
    expect(
      snapshot.attention.filter((item) => item.kind === "permission")
    ).toEqual([]);
    await next.screenshot({
      path: "/private/tmp/realmkeeper-monitor-history.png",
    });
    await playFixture(next, "permission-claude");
    await expect(
      next.getByRole("button", { name: /Permission needed/i })
    ).toBeVisible();
    await expect(
      next
        .getByRole("article", { name: "Permission needed" })
        .getByRole("button", { name: "Acknowledge" })
    ).toBeVisible();
    await expect(
      history.getByText(/Last seen history · 2 sessions/)
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await restarted.close();
  }
});
