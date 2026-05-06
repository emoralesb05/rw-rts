import { describe, expect, it } from "vitest";
import { unitIdentityFor, unitIdentityForUnit } from "./unit-identity";

describe("unit identity", () => {
  it("keeps the provider and stable path in the identity", () => {
    expect(unitIdentityFor("gemini", "/repo")).toBe("gemini::/repo");
  });

  it("prefers repoRoot over cwd for persisted unit identity", () => {
    expect(
      unitIdentityForUnit({
        tool: "claude",
        cwd: "/repo/packages/app",
        repoRoot: "/repo",
      })
    ).toBe("claude::/repo");
  });

  it("falls back to cwd for older units without repoRoot", () => {
    expect(
      unitIdentityForUnit({
        tool: "codex",
        cwd: "/repo/packages/app",
      })
    ).toBe("codex::/repo/packages/app");
  });
});
