// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AgentEvent, PersistedState } from "@shared/events";
import { EMPTY_PERSISTED } from "@shared/events";
import type { EventReducerState } from "../../store-domain/event-reducer";

function freshPersisted(): PersistedState {
  return {
    ...EMPTY_PERSISTED,
    standingOrders: [],
    wielders: {},
    worlds: {},
  };
}

function agentEvent(
  kind: AgentEvent["kind"],
  overrides: Partial<AgentEvent> = {}
): AgentEvent {
  return {
    sessionId: "fixture-claude",
    tool: "claude",
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp: 1000,
    kind,
    source: "spawned",
    ...overrides,
    payload: overrides.payload ?? {},
  } as AgentEvent;
}

describe("HUD fixture playback smoke", () => {
  afterEach(() => {
    vi.doUnmock("../../audio/sounds");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders wielders, alerts, activity, and letters from provider-like events", async () => {
    vi.doMock("../../audio/sounds", () => ({
      play: vi.fn(),
    }));
    Object.defineProperty(window, "rw", {
      configurable: true,
      value: {
        savePersisted: vi.fn(() => Promise.resolve()),
        resolvePermission: vi.fn(() => Promise.resolve(true)),
      },
    });

    const [
      { useStore },
      { usePanels },
      { applyOneEvent },
      { TooltipProvider },
      { AppToastProvider },
      { WielderHUD },
      { AlertsHUD },
      { ActivityLog },
      { LettersHUD },
    ] = await Promise.all([
      import("../../store"),
      import("../floating/panel-store"),
      import("../../store-domain/event-reducer"),
      import("../components/primitives/Tooltip"),
      import("../components/kit/ToastLayer"),
      import("./WielderHUD"),
      import("./AlertsHUD"),
      import("../ActivityLog"),
      import("./LettersHUD"),
    ]);

    let state: EventReducerState = {
      events: [],
      eventCount: 0,
      units: {},
      worlds: {},
      persisted: freshPersisted(),
      letters: [],
      standingOrders: {},
    };
    const reduce = (event: AgentEvent) => {
      state = { ...state, ...applyOneEvent(state, event) };
    };

    reduce(agentEvent("session_start", { timestamp: 1 }));
    reduce(
      agentEvent("assistant_text", {
        timestamp: 2,
        payload: { text: "I need to install the package before continuing." },
      })
    );
    reduce(
      agentEvent("permission_request", {
        timestamp: 3,
        payload: {
          requestId: "perm-1",
          name: "Bash",
          input: { command: "pnpm install" },
          permissionMode: "actionable",
          permissionOptions: [
            { id: "allow-once", label: "Allow once", decision: "allow" },
            { id: "deny", label: "Deny", decision: "deny" },
          ],
        },
      })
    );
    reduce(
      agentEvent("session_start", {
        sessionId: "fixture-codex",
        tool: "codex",
        timestamp: 4,
      })
    );
    reduce(
      agentEvent("user_input_request", {
        sessionId: "fixture-codex",
        tool: "codex",
        timestamp: 5,
        payload: {
          requestId: "input-1",
          name: "UserInput",
          text: "Choose the fixture implementation style.",
          questions: [
            {
              id: "approach",
              header: "Approach",
              question: "Which implementation style should Codex use?",
              required: true,
              options: [
                {
                  label: "Small",
                  value: "small",
                  description: "Keep the smoke scoped.",
                },
              ],
            },
          ],
        },
      })
    );

    useStore.setState(state);
    usePanels.setState(usePanels.getInitialState(), true);

    render(
      <TooltipProvider>
        <AppToastProvider>
          <WielderHUD />
          <AlertsHUD />
          <ActivityLog />
          <LettersHUD />
        </AppToastProvider>
      </TooltipProvider>
    );

    expect(screen.getByRole("region", { name: "Wielders" })).toHaveTextContent(
      /claude|codex/i
    );

    const alerts = screen.getByRole("region", { name: "Alerts" });
    expect(alerts).toHaveTextContent("Bash: pnpm install");
    expect(
      within(alerts).getByRole("button", { name: "Allow once" })
    ).toBeInTheDocument();

    const activity = screen.getByRole("log", { name: "Activity log" });
    expect(activity).toHaveTextContent(/asked permission/i);
    expect(activity).toHaveTextContent(/asked for input/i);

    const letters = screen.getByRole("region", { name: "Letters" });
    expect(letters).toHaveTextContent(/needs your answer/i);
    expect(letters).toHaveTextContent(
      "Which implementation style should Codex use?"
    );
  });
});
