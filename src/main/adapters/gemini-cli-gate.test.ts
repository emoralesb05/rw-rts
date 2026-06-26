import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

async function withMockHome<T>(
  fn: (home: string) => Promise<T> | T
): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), "realmkeeper-gemini-home-"));
  vi.resetModules();
  vi.doMock("node:os", async () => {
    const actual = await vi.importActual<typeof import("node:os")>("node:os");
    return { ...actual, homedir: () => home };
  });
  try {
    return await fn(home);
  } finally {
    vi.doUnmock("node:os");
    vi.resetModules();
    rmSync(home, { recursive: true, force: true });
  }
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Gemini launch gate", () => {
  it("requires enabled hooks before using Realmkeeper-gated yolo launches", async () => {
    await withMockHome(async (home) => {
      const settingsPath = join(home, ".gemini", "settings.json");
      const policyPath = join(
        home,
        ".gemini",
        "policies",
        "realmkeeper-managed.toml"
      );
      writeJson(settingsPath, {
        hooks: {
          BeforeTool: [
            {
              matcher: "*",
              hooks: [
                {
                  command:
                    "REALMKEEPER_GEMINI_FAIL_CLOSED=1 /repo/bin/realmkeeper-hook --tool gemini # realmkeeper-managed",
                },
              ],
            },
          ],
        },
      });
      mkdirSync(dirname(policyPath), { recursive: true });
      writeFileSync(policyPath, "# realmkeeper-managed\n");

      const { isRealmkeeperGeminiGateInstalled } = await import("./gemini-cli");

      expect(isRealmkeeperGeminiGateInstalled()).toBe(true);

      const settings = readJson(settingsPath);
      settings.hooksConfig = { enabled: false };
      writeJson(settingsPath, settings);

      expect(isRealmkeeperGeminiGateInstalled()).toBe(false);
    });
  });
});
