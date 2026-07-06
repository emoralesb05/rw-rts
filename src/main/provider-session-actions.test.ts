import { describe, expect, it, vi } from "vitest";
import {
  buildClaudeAttachAppleScriptArgs,
  buildClaudeAttachCommand,
  buildClaudeProviderSessionArgs,
  runClaudeProviderSessionAction,
  type ExecFileRunner,
} from "./provider-session-actions";

describe("provider session actions", () => {
  it("builds Claude attach and logs commands", () => {
    expect(buildClaudeProviderSessionArgs("logs", "session-1")).toEqual([
      "logs",
      "session-1",
    ]);
    expect(buildClaudeProviderSessionArgs("attach", "session-1")).toEqual([
      "attach",
      "session-1",
    ]);
    expect(
      buildClaudeAttachCommand({
        cwd: "/repo/with space",
        sessionId: "claude-session-1",
      })
    ).toBe("cd '/repo/with space' && claude attach 'claude-session-1'");
    expect(
      buildClaudeAttachCommand({
        cwd: "/repo/with 'quote'",
        sessionId: "claude-session-'1'",
      })
    ).toBe(
      "cd '/repo/with '\\''quote'\\''' && claude attach 'claude-session-'\\''1'\\'''"
    );
    expect(
      buildClaudeAttachAppleScriptArgs({
        cwd: "/repo",
        sessionId: "claude-session-1",
      })
    ).toEqual([
      "-e",
      "tell application \"Terminal\" to do script \"cd '/repo' && claude attach 'claude-session-1'\"",
      "-e",
      'tell application "Terminal" to activate',
    ]);
  });

  it("rejects unsafe Claude command values", () => {
    expect(() => buildClaudeProviderSessionArgs("logs", "bad\nid")).toThrow(
      /control characters/i
    );
    expect(() =>
      buildClaudeAttachCommand({
        cwd: "/repo",
        sessionId: "bad\0id",
      })
    ).toThrow(/control characters/i);
  });

  it("captures Claude logs output", async () => {
    const runner = vi.fn<ExecFileRunner>(() =>
      Promise.resolve({ stdout: "recent logs\n", stderr: "" })
    );

    await expect(
      runClaudeProviderSessionAction(
        {
          action: "logs",
          cwd: "/repo",
          sessionId: "claude-session-1",
        },
        runner
      )
    ).resolves.toEqual({ output: "recent logs" });

    expect(runner).toHaveBeenCalledWith(
      "claude",
      ["logs", "claude-session-1"],
      expect.objectContaining({
        cwd: "/repo",
        timeout: 8_000,
      })
    );
  });

  it("launches Claude attach through Terminal on macOS", async () => {
    const runner = vi.fn<ExecFileRunner>(() =>
      Promise.resolve({ stdout: "", stderr: "" })
    );

    await expect(
      runClaudeProviderSessionAction(
        {
          action: "attach",
          cwd: "/repo",
          platform: "darwin",
          sessionId: "claude-session-1",
        },
        runner
      )
    ).resolves.toEqual({ output: "Opened Claude attach in Terminal." });

    expect(runner).toHaveBeenCalledWith(
      "osascript",
      buildClaudeAttachAppleScriptArgs({
        cwd: "/repo",
        sessionId: "claude-session-1",
      }),
      expect.objectContaining({ timeout: 8_000 })
    );
  });

  it("rejects Claude attach when Terminal launch is unsupported", async () => {
    await expect(
      runClaudeProviderSessionAction(
        {
          action: "attach",
          cwd: "/repo",
          platform: "linux",
          sessionId: "claude-session-1",
        },
        vi.fn<ExecFileRunner>()
      )
    ).rejects.toThrow(/Terminal support/i);
  });
});
