import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addPermissionRule,
  clearPermissionRules,
  listPermissionRules,
  matchPermissionRule,
  resetPermissionRulesForTests,
  ruleFromPermissionChoice,
  setPermissionRulesFileForTests,
} from "./permission-rules";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "realmkeeper-permission-rules-"));
  setPermissionRulesFileForTests(join(dir, "permissions.json"));
  clearPermissionRules();
});

afterEach(() => {
  clearPermissionRules();
  resetPermissionRulesForTests();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("permission rules", () => {
  it("creates a workspace rule from an exact permission request", () => {
    const rule = ruleFromPermissionChoice("allow-workspace", {
      provider: "gemini",
      sessionId: "s1",
      cwd: "/repo",
      repoRoot: "/repo",
      name: "Bash",
      input: { command: "pnpm test" },
      requestId: "req-1",
    });

    expect(rule).toMatchObject({
      provider: "gemini",
      behavior: "allow",
      scope: "workspace",
      repoRoot: "/repo",
      matcher: { toolName: "Bash", argKey: "cmd:pnpm test" },
    });
    expect(listPermissionRules()).toHaveLength(1);
  });

  it("matches workspace rules only inside the same repo", () => {
    addPermissionRule({
      provider: "claude",
      behavior: "allow",
      scope: "workspace",
      repoRoot: "/repo",
      cwd: "/repo",
      matcher: { toolName: "Bash", argKey: "cmd:pnpm test" },
    });

    expect(
      matchPermissionRule({
        provider: "claude",
        sessionId: "s1",
        cwd: "/repo/packages/app",
        repoRoot: "/repo",
        name: "Bash",
        input: { command: "pnpm test" },
      })?.decision
    ).toBe("allow");
    expect(
      matchPermissionRule({
        provider: "claude",
        sessionId: "s1",
        cwd: "/other",
        repoRoot: "/other",
        name: "Bash",
        input: { command: "pnpm test" },
      })
    ).toBeNull();
  });

  it("gives deny rules precedence over allow rules", () => {
    addPermissionRule({
      provider: "codex",
      behavior: "allow",
      scope: "session",
      sessionId: "s1",
      matcher: { toolName: "Bash", argKey: "cmd:pnpm test" },
    });
    addPermissionRule({
      provider: "codex",
      behavior: "deny",
      scope: "global",
      matcher: { toolName: "Bash", argKey: "cmd:pnpm test" },
    });

    expect(
      matchPermissionRule({
        provider: "codex",
        sessionId: "s1",
        cwd: "/repo",
        repoRoot: "/repo",
        name: "Bash",
        input: { command: "pnpm test" },
      })?.decision
    ).toBe("deny");
  });
});
