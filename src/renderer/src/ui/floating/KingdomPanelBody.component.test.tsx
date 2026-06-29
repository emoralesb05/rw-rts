// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KingdomPanelBody } from "./KingdomPanelBody";
import type { HooksStatus } from "@shared/schemas";

const BASE_STATUS: HooksStatus = {
  installed: false,
  socketPath: "/tmp/realmkeeper.sock",
  hookScriptPath: "/home/user/.realmkeeper/realmkeeper-hook",
};

function installRw() {
  const claudeStatus: HooksStatus = {
    ...BASE_STATUS,
    hooksConfigPath: "/home/user/.claude/settings.json",
    cliVersion: "2.1.195 (Claude Code)",
    authStatus: {
      loggedIn: true,
      authMethod: "claude.ai",
      apiProvider: "firstParty",
      subscriptionType: "max",
    },
    transcriptWatcherPath: "/home/user/.claude/projects",
    transcriptWatcherPollMs: 2000,
    richStreamFlags: {
      includeHookEvents: false,
      includePartialMessages: false,
      promptSuggestions: false,
    },
  };
  const geminiStatus: HooksStatus = {
    ...BASE_STATUS,
    hooksConfigPath: "/home/user/.gemini/settings.json",
    policyConfigPath: "/home/user/.gemini/policies/realmkeeper-managed.toml",
    hooksEnabled: true,
    failClosedHookInstalled: true,
    managedPolicyInstalled: true,
    launchApprovalMode: "yolo",
    settingsTemplate: JSON.stringify(
      {
        hooksConfig: {
          enabled: true,
        },
      },
      null,
      2
    ),
  };

  const rw = {
    hooksStatus: vi.fn(() => Promise.resolve(claudeStatus)),
    cursorHooksStatus: vi.fn(() => Promise.resolve(BASE_STATUS)),
    codexHooksStatus: vi.fn(() => Promise.resolve(BASE_STATUS)),
    geminiHooksStatus: vi.fn(() => Promise.resolve(geminiStatus)),
    installHooks: vi.fn(() => Promise.resolve(claudeStatus)),
    uninstallHooks: vi.fn(() => Promise.resolve(claudeStatus)),
    installCursorHooks: vi.fn(() => Promise.resolve(BASE_STATUS)),
    uninstallCursorHooks: vi.fn(() => Promise.resolve(BASE_STATUS)),
    installCodexHooks: vi.fn(() => Promise.resolve(BASE_STATUS)),
    uninstallCodexHooks: vi.fn(() => Promise.resolve(BASE_STATUS)),
    installGeminiHooks: vi.fn(() => Promise.resolve(geminiStatus)),
    uninstallGeminiHooks: vi.fn(() => Promise.resolve(geminiStatus)),
    savePersisted: vi.fn(() => Promise.resolve()),
  };

  Object.defineProperty(window, "rw", {
    configurable: true,
    writable: true,
    value: rw,
  });

  return { rw, claudeStatus, geminiStatus };
}

function installClipboard() {
  const clipboard = {
    writeText: vi.fn(() => Promise.resolve()),
  };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
  return clipboard;
}

describe("KingdomPanelBody", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies the Gemini settings template from the connection tab", async () => {
    const { geminiStatus } = installRw();
    const user = userEvent.setup();
    const clipboard = installClipboard();

    render(<KingdomPanelBody initialTab="connection" />);

    expect(await screen.findByText("Gemini hook bridge")).toBeVisible();
    expect(await screen.findByText("2.1.195 (Claude Code)")).toBeVisible();
    expect(screen.getByText("logged in")).toBeVisible();
    expect(screen.getByText("claude.ai")).toBeVisible();
    expect(screen.getByText("/home/user/.claude/projects")).toBeVisible();
    expect(screen.getByText(/partials/i)).toBeVisible();
    await waitFor(() => {
      expect(screen.getByText(/--approval-mode yolo/i)).toBeVisible();
    });

    await user.click(
      screen.getByRole("button", { name: /copy gemini settings template/i })
    );

    expect(clipboard.writeText).toHaveBeenCalledWith(
      geminiStatus.settingsTemplate
    );
    expect(
      screen.getByRole("button", { name: /copy gemini settings template/i })
    ).toHaveTextContent("Copied");
  });
});
