import { describe, expect, it } from "vitest";
import { createHookDedupe } from "./hook-dedupe";

describe("hook dedupe", () => {
  it("drops identical hook fires within the default TTL", () => {
    const dedupe = createHookDedupe();
    const payload = {
      hook_event_name: "PreToolUse",
      session_id: "s1",
      tool_name: "Bash",
      tool_input: { command: "pwd" },
    };

    expect(dedupe.isDuplicate(payload, "PreToolUse", 1000)).toBe(false);
    expect(dedupe.isDuplicate(payload, "PreToolUse", 1500)).toBe(true);
    expect(dedupe.isDuplicate(payload, "PreToolUse", 2600)).toBe(false);
  });

  it("uses tool_use_id when present", () => {
    const dedupe = createHookDedupe();
    const base = {
      hook_event_name: "PostToolUse",
      session_id: "s1",
      tool_use_id: "tool-1",
      tool_response: "first",
    };

    expect(dedupe.isDuplicate(base, "PostToolUse", 1000)).toBe(false);
    expect(
      dedupe.isDuplicate(
        {
          ...base,
          tool_response: "different response still same upstream fire",
        },
        "PostToolUse",
        1200
      )
    ).toBe(true);
  });

  it("uses the longer prompt dedupe window for prompt-submit hooks", () => {
    const dedupe = createHookDedupe();
    const payload = {
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      prompt: "continue",
    };

    expect(dedupe.isDuplicate(payload, "UserPromptSubmit", 1000)).toBe(false);
    expect(dedupe.isDuplicate(payload, "UserPromptSubmit", 10_000)).toBe(true);
    expect(dedupe.isDuplicate(payload, "UserPromptSubmit", 14_000)).toBe(false);
  });

  it("does not let the Realmkeeper permission marker affect the dedupe key", () => {
    const dedupe = createHookDedupe();
    const base = {
      hook_event_name: "PreToolUse",
      session_id: "s1",
      tool_name: "Bash",
      tool_input: { command: "pwd" },
    };

    expect(
      dedupe.isDuplicate(
        { ...base, __rw_permission_request_id: "req-1" },
        "PreToolUse",
        1000
      )
    ).toBe(false);
    expect(
      dedupe.isDuplicate(
        { ...base, __rw_permission_request_id: "req-2" },
        "PreToolUse",
        1200
      )
    ).toBe(true);
  });
});
