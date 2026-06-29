import {
  existsSync,
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
  const home = mkdtempSync(join(tmpdir(), "realmkeeper-home-"));
  vi.resetModules();
  vi.doMock("node:os", async () => {
    const actual = await vi.importActual<typeof import("node:os")>("node:os");
    return { ...actual, homedir: () => home };
  });
  vi.doMock("electron", () => ({
    app: {
      isPackaged: false,
      getAppPath: () => process.cwd(),
    },
  }));
  try {
    return await fn(home);
  } finally {
    vi.doUnmock("node:os");
    vi.doUnmock("electron");
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

function countClaudeLikeManagedEntries(settings: any, event: string): number {
  return (settings.hooks?.[event] ?? []).filter((entry: any) =>
    (entry.hooks ?? []).some((hook: any) =>
      String(hook.command ?? "").includes("realmkeeper-managed")
    )
  ).length;
}

function countCursorManagedEntries(file: any, event: string): number {
  return (file.hooks?.[event] ?? []).filter((entry: any) =>
    String(entry.command ?? "").includes("realmkeeper-hook")
  ).length;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provider hook installers", () => {
  it("installs Claude hooks idempotently and preserves foreign entries", async () => {
    await withMockHome(async (home) => {
      const settingsPath = join(home, ".claude", "settings.json");
      writeJson(settingsPath, {
        hooks: {
          PreToolUse: [
            {
              matcher: "foreign",
              hooks: [{ type: "command", command: "foreign-claude-hook" }],
            },
          ],
        },
      });

      const { installHooks, uninstallHooks, isInstalled } =
        await import("./hook-installer");

      installHooks();
      installHooks();

      const installed = readJson(settingsPath);
      expect(isInstalled()).toBe(true);
      for (const event of [
        "PreToolUse",
        "PostToolUse",
        "PermissionRequest",
        "UserPromptSubmit",
        "SessionStart",
        "SessionEnd",
        "Stop",
        "SubagentStop",
      ]) {
        expect(countClaudeLikeManagedEntries(installed, event)).toBe(1);
      }
      expect(installed.hooks.PreToolUse).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ matcher: "foreign" }),
        ])
      );

      uninstallHooks();
      const uninstalled = readJson(settingsPath);
      expect(isInstalled()).toBe(false);
      expect(countClaudeLikeManagedEntries(uninstalled, "PreToolUse")).toBe(0);
      expect(uninstalled.hooks.PreToolUse).toEqual([
        {
          matcher: "foreign",
          hooks: [{ type: "command", command: "foreign-claude-hook" }],
        },
      ]);
    });
  });

  it("installs Cursor hooks idempotently and preserves foreign entries", async () => {
    await withMockHome(async (home) => {
      const hooksPath = join(home, ".cursor", "hooks.json");
      writeJson(hooksPath, {
        version: 1,
        hooks: {
          preToolUse: [{ command: "foreign-cursor-hook", timeout: 5 }],
        },
      });

      const { installCursorHooks, uninstallCursorHooks, isCursorInstalled } =
        await import("./cursor-hook-installer");

      installCursorHooks();
      installCursorHooks();

      const installed = readJson(hooksPath);
      expect(isCursorInstalled()).toBe(true);
      for (const event of [
        "sessionStart",
        "sessionEnd",
        "stop",
        "beforeSubmitPrompt",
        "preToolUse",
        "postToolUse",
        "afterAgentResponse",
        "beforeShellExecution",
      ]) {
        expect(countCursorManagedEntries(installed, event)).toBe(1);
      }
      expect(installed.hooks.preToolUse).toEqual(
        expect.arrayContaining([{ command: "foreign-cursor-hook", timeout: 5 }])
      );

      uninstallCursorHooks();
      const uninstalled = readJson(hooksPath);
      expect(isCursorInstalled()).toBe(false);
      expect(countCursorManagedEntries(uninstalled, "preToolUse")).toBe(0);
      expect(uninstalled.hooks.preToolUse).toEqual([
        { command: "foreign-cursor-hook", timeout: 5 },
      ]);
    });
  });

  it("installs Gemini hooks and managed policy idempotently", async () => {
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
              matcher: "foreign",
              hooks: [{ type: "command", command: "foreign-gemini-hook" }],
            },
          ],
        },
      });

      const {
        installGeminiHooks,
        uninstallGeminiHooks,
        isGeminiInstalled,
        getGeminiHooksStatus,
      } = await import("./gemini-hook-installer");

      installGeminiHooks();
      installGeminiHooks();

      const installed = readJson(settingsPath);
      expect(isGeminiInstalled()).toBe(true);
      expect(getGeminiHooksStatus()).toMatchObject({
        installed: true,
        hooksConfigPath: settingsPath,
        policyConfigPath: policyPath,
        hooksEnabled: true,
        failClosedHookInstalled: true,
        managedPolicyInstalled: true,
        launchApprovalMode: "yolo",
        settingsTemplate: expect.stringContaining('"hooksConfig"'),
      });
      expect(existsSync(policyPath)).toBe(true);
      for (const event of [
        "SessionStart",
        "SessionEnd",
        "BeforeAgent",
        "BeforeModel",
        "BeforeToolSelection",
        "BeforeTool",
        "AfterTool",
        "AfterModel",
        "AfterAgent",
        "PreCompress",
        "Notification",
      ]) {
        expect(countClaudeLikeManagedEntries(installed, event)).toBe(1);
      }
      expect(installed.hooks.BeforeTool).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ matcher: "foreign" }),
        ])
      );
      expect(
        installed.hooks.BeforeTool.some((entry: any) =>
          (entry.hooks ?? []).some((hook: any) =>
            String(hook.command ?? "").includes(
              "REALMKEEPER_GEMINI_FAIL_CLOSED=1"
            )
          )
        )
      ).toBe(true);

      uninstallGeminiHooks();
      const uninstalled = readJson(settingsPath);
      expect(isGeminiInstalled()).toBe(false);
      expect(existsSync(policyPath)).toBe(false);
      expect(countClaudeLikeManagedEntries(uninstalled, "BeforeTool")).toBe(0);
      expect(uninstalled.hooks.BeforeTool).toEqual([
        {
          matcher: "foreign",
          hooks: [{ type: "command", command: "foreign-gemini-hook" }],
        },
      ]);
    });
  });

  it("treats globally disabled Gemini hooks as not installed", async () => {
    await withMockHome(async (home) => {
      const settingsPath = join(home, ".gemini", "settings.json");
      const policyPath = join(
        home,
        ".gemini",
        "policies",
        "realmkeeper-managed.toml"
      );

      const { installGeminiHooks, isGeminiInstalled, getGeminiHooksStatus } =
        await import("./gemini-hook-installer");

      installGeminiHooks();
      const settings = readJson(settingsPath);
      settings.hooksConfig = { enabled: false };
      writeJson(settingsPath, settings);
      expect(existsSync(policyPath)).toBe(true);
      expect(isGeminiInstalled()).toBe(false);
      expect(getGeminiHooksStatus()).toMatchObject({
        installed: false,
        hooksEnabled: false,
        failClosedHookInstalled: true,
        managedPolicyInstalled: true,
        launchApprovalMode: "default",
      });
    });
  });

  it("installs Codex config blocks idempotently and preserves surrounding config", async () => {
    await withMockHome(async (home) => {
      const configPath = join(home, ".codex", "config.toml");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, 'model = "gpt-5.3-codex"\n');

      const { installCodexHooks, uninstallCodexHooks, isCodexInstalled } =
        await import("./codex-hook-installer");

      installCodexHooks();
      installCodexHooks();

      const installed = readFileSync(configPath, "utf8");
      expect(isCodexInstalled()).toBe(true);
      expect(installed).toContain('model = "gpt-5.3-codex"');
      expect(installed.match(/realmkeeper-hooks-start/g)?.length).toBe(1);
      expect(installed.match(/realmkeeper-hooks-end/g)?.length).toBe(1);
      expect(installed.match(/--tool codex/g)?.length).toBe(6);

      uninstallCodexHooks();
      const uninstalled = readFileSync(configPath, "utf8");
      expect(isCodexInstalled()).toBe(false);
      expect(uninstalled).toBe('model = "gpt-5.3-codex"\n');
    });
  });
});
