import { describe, expect, it } from "vitest";
import { isExcluded } from "./settings";

const repo = {
  path: "/Users/ed/Github/forks/vercel-ai",
  label: "forks/vercel-ai",
  name: "vercel-ai",
};

describe("settings exclusions", () => {
  it("matches repo basename", () => {
    expect(isExcluded(repo, ["vercel-ai"])).toBe(true);
  });

  it("matches repo label", () => {
    expect(isExcluded(repo, ["forks/vercel-ai"])).toBe(true);
  });

  it("matches relative directory globs", () => {
    expect(isExcluded(repo, ["forks/*"])).toBe(true);
  });

  it("matches absolute directory globs", () => {
    expect(isExcluded(repo, ["/Users/ed/Github/forks/*"])).toBe(true);
  });

  it("matches exact absolute paths", () => {
    expect(isExcluded(repo, ["/Users/ed/Github/forks/vercel-ai"])).toBe(true);
  });

  it("does not match unrelated patterns", () => {
    expect(isExcluded(repo, ["dreambase", "other/*"])).toBe(false);
  });
});
