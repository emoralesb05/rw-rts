import { resolve } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer/src"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [["**/*.component.test.tsx", "jsdom"]],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    setupFiles: ["src/renderer/src/test/setup.ts"],
  },
});
