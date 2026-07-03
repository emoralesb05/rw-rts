// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KingdomPanelBody } from "./KingdomPanelBody";
import { usePanels } from "./panel-store";
import { useStore } from "../../store";
import type { AgentEvent, UnitState } from "@shared/events";
import type {
  CreateOrchestrationRunRequest,
  HooksStatus,
} from "@shared/schemas";
import type { OrchestrationRun } from "@shared/orchestration";

const BASE_STATUS: HooksStatus = {
  installed: false,
  socketPath: "/tmp/realmkeeper.sock",
  hookScriptPath: "/home/user/.realmkeeper/realmkeeper-hook",
};

function installRw() {
  const run: OrchestrationRun = {
    id: "run-1",
    template: "standing-order",
    title: "Keep tests moving",
    status: "running",
    cwd: "/repo",
    repoRoot: "/repo",
    createdAt: 1_000,
    updatedAt: 3_000,
    providerSessions: [],
    traceIds: [],
    permissionRequestIds: [],
    userInputRequestIds: [],
    steps: [],
    checkpoints: [],
    budget: { maxIterations: 3 },
    events: [],
  };
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
    exportTraces: vi.fn(() =>
      Promise.resolve({
        path: "/home/user/.realmkeeper/traces/exports/2026-07-03-all.otel.json",
        traceCount: 1,
        spanCount: 3,
        contentMode: "metadata-only" as const,
      })
    ),
    listOrchestrationRuns: vi.fn(() => Promise.resolve([run])),
    createOrchestrationRun: vi.fn((req: CreateOrchestrationRunRequest) =>
      Promise.resolve({
        ...run,
        id: "run-2",
        template: req.template,
        title: req.title,
        status: req.status ?? "queued",
        budget: req.budget ?? {},
        params: req.params,
      })
    ),
    controlOrchestrationRun: vi.fn(() =>
      Promise.resolve({
        ...run,
        status: "paused" as const,
        updatedAt: 4_000,
        pauseReason: "Paused from Run Board.",
      })
    ),
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
    usePanels.setState(usePanels.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it("renders current trace health in the Observatory tab", async () => {
    const { rw } = installRw();
    const user = userEvent.setup();
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
    expect(screen.getByText("Trace export")).toBeVisible();
    expect(screen.getByText("Active waits")).toBeVisible();
    expect(screen.getByText("Recent errors")).toBeVisible();
    expect(screen.getByText("Trace sessions")).toBeVisible();
    expect(screen.getByText("input")).toBeVisible();
    expect(screen.getAllByText("not owned").length).toBeGreaterThan(0);
    expect(screen.getByText("Vaelen")).toBeVisible();
    expect(screen.getByText(/codex · 3 spans · error/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: /export today/i }));

    expect(rw.exportTraces).toHaveBeenCalledWith({
      day: new Date(now - 1_000).toISOString().slice(0, 10),
    });
    expect(await screen.findByText(/2026-07-03-all\.otel\.json/)).toBeVisible();
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

  it("lists durable runs and controls them from the Runs tab", async () => {
    const { rw } = installRw();
    const user = userEvent.setup();

    render(<KingdomPanelBody initialTab="runs" />);

    expect(await screen.findByText("Run board")).toBeVisible();
    expect(screen.getByText("Keep tests moving")).toBeVisible();
    expect(screen.getByText("standing-order")).toBeVisible();
    expect(screen.getAllByText("running").length).toBeGreaterThan(0);
    expect(screen.getByText("2s")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /pause run keep tests moving/i })
    );

    expect(rw.controlOrchestrationRun).toHaveBeenCalledWith({
      runId: "run-1",
      action: "pause",
      reason: "Paused from Run Board.",
    });
    await waitFor(() => {
      expect(screen.getAllByText("paused").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Paused from Run Board.")).toBeVisible();
  });

  it("creates queued draft runs from registered templates", async () => {
    const { rw } = installRw();
    const user = userEvent.setup();
    useStore.setState({
      units: { s1: unit() },
    });

    render(<KingdomPanelBody initialTab="runs" />);

    expect(await screen.findByText("New run")).toBeVisible();
    expect(screen.getByText(/Vaelen · codex · working/i)).toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: /create provider handoff review run/i,
      })
    );

    expect(rw.createOrchestrationRun).toHaveBeenCalledWith({
      template: "provider-handoff-review",
      title: "Provider Handoff Review draft",
      params: {
        target: {
          unitId: "s1",
          sessionId: "s1",
          tool: "codex",
          cwd: "/repo",
          status: "working",
        },
        sourceTraceId: "trace:codex:s1",
        handoffPrompt:
          "Review the selected session. Identify risks, missed tests, and next actions.",
      },
      budget: {
        maxIterations: 3,
        maxConsecutiveFailures: 1,
        maxRuntimeMs: 1_800_000,
      },
      status: "queued",
    });
    await waitFor(() => {
      expect(screen.getByText("Provider Handoff Review draft")).toBeVisible();
    });
    expect(screen.getAllByText("queued").length).toBeGreaterThan(0);
  });

  it("links Run board rows to sessions, traces, and letters", async () => {
    const { rw } = installRw();
    const user = userEvent.setup();
    const linkedRun: OrchestrationRun = {
      id: "run-linked",
      template: "provider-handoff-review",
      title: "Review linked run",
      status: "running",
      cwd: "/repo",
      repoRoot: "/repo",
      createdAt: 1_000,
      updatedAt: 2_000,
      providerSessions: [
        {
          unitId: "s1",
          sessionId: "s1",
          tool: "codex",
          cwd: "/repo",
          traceId: "trace:codex:s1",
        },
      ],
      traceIds: ["trace:codex:s1"],
      permissionRequestIds: ["perm-1"],
      userInputRequestIds: [],
      steps: [],
      checkpoints: [],
      budget: {},
      events: [],
    };
    rw.listOrchestrationRuns.mockResolvedValue([linkedRun]);
    useStore.setState({
      units: { s1: unit() },
      events: [
        event(Date.now() - 1_000, "assistant_text", {
          text: "Captured review.",
        }),
      ],
      letters: [
        {
          id: "letter-1",
          createdAt: Date.now(),
          severity: "important",
          title: "Permission needed",
          sessionId: "s1",
          actions: [
            {
              label: "Review",
              action: { kind: "permission-observe", requestId: "perm-1" },
            },
          ],
        },
      ],
    });

    render(<KingdomPanelBody initialTab="runs" />);

    expect(await screen.findByText("Review linked run")).toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Open session for run Review linked run",
      })
    );
    expect(usePanels.getState().drawer?.activeTab).toBe("s1");

    await user.click(
      screen.getByRole("button", {
        name: "Open trace for run Review linked run",
      })
    );
    expect(await screen.findByText("Trace sessions")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /runs/i }));
    await user.click(
      screen.getByRole("button", {
        name: "Open letters for run Review linked run",
      })
    );
    expect(usePanels.getState().alertsZ).not.toBeNull();
  });
});
