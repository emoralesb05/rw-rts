import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/specs",
  outputDir: "/private/tmp/realmkeeper-e2e-output",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
});
