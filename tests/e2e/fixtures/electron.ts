import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  expect,
  test as base,
  type ConsoleMessage,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

type AppErrors = {
  main: string[];
  page: string[];
};

type ElectronFixtures = {
  electronApp: ElectronApplication;
  appPage: Page;
  appErrors: AppErrors;
};

function consoleMessageText(msg: ConsoleMessage): string {
  return `[${msg.type()}] ${msg.text()}`;
}

export const test = base.extend<ElectronFixtures>({
  appErrors: async ({}, runFixture) => {
    await runFixture({ main: [], page: [] });
  },

  electronApp: async ({ appErrors }, runFixture) => {
    const repoRoot = resolve(process.cwd());
    const home = mkdtempSync(join(tmpdir(), "realmkeeper-e2e-home-"));
    const userData = mkdtempSync(join(tmpdir(), "realmkeeper-e2e-user-data-"));
    const app = await electron.launch({
      args: [join(repoRoot, "out/main/index.js")],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        HOME: home,
        REALMKEEPER_E2E: "1",
        REALMKEEPER_USER_DATA: userData,
      },
      recordVideo: { dir: "/private/tmp/realmkeeper-e2e-output/videos" },
      timeout: 30_000,
    });

    app.on("console", (msg) => {
      if (msg.type() === "error") {
        appErrors.main.push(consoleMessageText(msg));
      }
    });

    try {
      await runFixture(app);
    } finally {
      await app.close().catch(() => {});
      rmSync(home, { recursive: true, force: true });
      rmSync(userData, { recursive: true, force: true });
    }

    expect(appErrors.main).toEqual([]);
  },

  appPage: async ({ appErrors, electronApp }, runFixture) => {
    const page = await electronApp.firstWindow();
    await page.setViewportSize({ width: 1400, height: 900 });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        appErrors.page.push(consoleMessageText(msg));
      }
    });
    page.on("pageerror", (err) => {
      appErrors.page.push(err.stack ?? err.message);
    });

    await page.waitForLoadState("domcontentloaded");
    await runFixture(page);

    expect(appErrors.page).toEqual([]);
  },
});

export { expect };
