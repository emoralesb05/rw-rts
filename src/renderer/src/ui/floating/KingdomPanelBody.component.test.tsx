// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KingdomPanelBody } from "./KingdomPanelBody";
import { useStore } from "../../store";
import type { AgentEvent, UnitState } from "@shared/events";
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
    cliVersion: "0.49.0",
    authStatus: {
      loggedIn: true,
      authMethod: "oauth-personal",
      apiProvider: "Google sign-in",
      subscriptionType: "cached OAuth",
    },
    authIssue: {
      code: "gemini-oauth-headless-unverified",
      severity: "info",
      message:
        "Gemini Google sign-in is configured, but Realmkeeper cannot infer from local settings whether this account tier supports headless Gemini CLI turns.",
      action:
        "If OAuth launch fails, sign in with the intended Google AI Pro, Ultra, or Workspace account, or set GEMINI_API_KEY or Vertex AI for the Gemini provider.",
    },
    hooksEnabled: true,
    failClosedHookInstalled: true,
    managedPolicyInstalled: true,
    launchApprovalMode: "yolo",
    sessionDiagnostics: {
      listSessionsAvailable: true,
      sessionCount: 0,
    },
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
  const cursorStatus: HooksStatus = {
    ...BASE_STATUS,
    hooksConfigPath: "/home/user/.cursor/hooks.json",
    cliVersion: "2026.06.26-7079533",
    authStatus: {
      loggedIn: true,
      authMethod: "cursor-agent status",
      apiProvider: "Cursor",
    },
  };

  const rw = {
    hooksStatus: vi.fn(() => Promise.resolve(claudeStatus)),
    cursorHooksStatus: vi.fn(() => Promise.resolve(cursorStatus)),
    codexHooksStatus: vi.fn(() => Promise.resolve(BASE_STATUS)),
    geminiHooksStatus: vi.fn(() => Promise.resolve(geminiStatus)),
    installHooks: vi.fn(() => Promise.resolve(claudeStatus)),
    uninstallHooks: vi.fn(() => Promise.resolve(claudeStatus)),
    installCursorHooks: vi.fn(() => Promise.resolve(cursorStatus)),
    uninstallCursorHooks: vi.fn(() => Promise.resolve(cursorStatus)),
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

  return { rw, claudeStatus, cursorStatus, geminiStatus };
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

function unit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "s1",
    sessionId: "s1",
    tool: "codex",
    role: "warden1",
    displayName: "Vaelen",
    cwd: "/repo",
    repoRoot: "/repo",
    worldId: "world-1",
    hp: 100,
    mp: 100,
    status: "working",
    lastActivity: 1,
    spawnedHere: true,
    ...overrides,
  };
}

function event(
  timestamp: number,
  kind: AgentEvent["kind"],
  payload: AgentEvent["payload"]
): AgentEvent {
  return {
    sessionId: "s1",
    tool: "codex",
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp,
    kind,
    payload,
    source: "realmkeeper",
  };
}

describe("KingdomPanelBody", () => {
  afterEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it("renders current trace health in the Observatory tab", () => {
    installRw();
    const now = Date.now();
    useStore.setState({
      units: { s1: unit() },
      events: [
        event(now - 1_000, "session_control", {
          controlAction: "stop",
          ok: false,
          reason: "not owned",
        }),
        event(now - 45_000, "user_input_request", {
          requestId: "input-1",
          questions: [{ id: "choice", header: "Choice", question: "Pick one" }],
        }),
      ],
    });

    render(<KingdomPanelBody initialTab="observatory" />);

    expect(screen.getByRole("tab", { name: /observatory/i })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByText("Monitor signals")).toBeVisible();
    expect(screen.getByText("Trace error")).toBeVisible();
    expect(screen.getByText("Waiting for input")).toBeVisible();
    expect(screen.getByText("Active waits")).toBeVisible();
    expect(screen.getByText("Recent errors")).toBeVisible();
    expect(screen.getByText("Trace sessions")).toBeVisible();
    expect(screen.getByText("input")).toBeVisible();
    expect(screen.getAllByText("not owned").length).toBeGreaterThan(0);
    expect(screen.getByText("Vaelen")).toBeVisible();
    expect(screen.getByText(/codex · 3 spans · error/i)).toBeVisible();
  });

  it("copies the Gemini settings template from the connection tab", async () => {
    const { geminiStatus } = installRw();
    const user = userEvent.setup();
    const clipboard = installClipboard();

    render(<KingdomPanelBody initialTab="connection" />);

    expect(await screen.findByText("Gemini hook bridge")).toBeVisible();
    expect(await screen.findByText("2.1.195 (Claude Code)")).toBeVisible();
    expect(await screen.findByText("2026.06.26-7079533")).toBeVisible();
    expect(screen.getByText("cursor-agent status")).toBeVisible();
    expect(screen.getByText("--force")).toBeVisible();
    expect(screen.getByText("--trust")).toBeVisible();
    expect(screen.getByText("observe-only")).toBeVisible();
    expect(screen.getAllByText("logged in")).toHaveLength(2);
    expect(screen.getByText("claude.ai")).toBeVisible();
    expect(screen.getByText("/home/user/.claude/projects")).toBeVisible();
    expect(screen.getByText(/partials/i)).toBeVisible();
    expect(screen.getByText("oauth-personal")).toBeVisible();
    expect(screen.getByText("Google sign-in")).toBeVisible();
    expect(screen.getByText("cached OAuth")).toBeVisible();
    expect(screen.getByText(/cannot infer/i)).toBeVisible();
    expect(screen.getByText("0 sessions")).toBeVisible();
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
