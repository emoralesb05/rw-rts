// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WielderChatInput } from "./WielderChatInput";
import type { UnitState } from "@shared/events";

function installKh(sendPrompt = vi.fn(() => Promise.resolve(true))) {
  const kh = { sendPrompt };

  Object.defineProperty(window, "kh", {
    configurable: true,
    writable: true,
    value: kh,
  });

  return kh;
}

function unit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "unit-1",
    sessionId: "unit-1",
    tool: "claude",
    role: "keyblader1",
    displayName: "Vaelen",
    cwd: "/repo",
    repoRoot: "/repo",
    worldId: "_repo",
    hp: 100,
    mp: 100,
    status: "idle",
    lastActivity: 1,
    spawnedAt: 1,
    spawnedHere: true,
    ...overrides,
  };
}

describe("WielderChatInput", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends typed prompts and clears the input", async () => {
    const kh = installKh();
    const user = userEvent.setup();
    render(<WielderChatInput unit={unit()} />);

    const input = screen.getByPlaceholderText(/message vaelen/i);
    await user.type(input, "please run the focused tests");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(kh.sendPrompt).toHaveBeenCalledWith({
        unitId: "unit-1",
        prompt: "please run the focused tests",
      });
    });
    expect(input).toHaveValue("");
  });

  it("supports meta-enter send without submitting blank prompts", async () => {
    const kh = installKh();
    const user = userEvent.setup();
    render(<WielderChatInput unit={unit()} />);

    const input = screen.getByPlaceholderText(/message vaelen/i);
    await user.click(input);
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(kh.sendPrompt).not.toHaveBeenCalled();

    await user.type(input, "ship it");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() => {
      expect(kh.sendPrompt).toHaveBeenCalledWith({
        unitId: "unit-1",
        prompt: "ship it",
      });
    });
  });

  it("disables command input for observed-only and inactive units", () => {
    installKh();
    const { rerender } = render(
      <WielderChatInput unit={unit({ spawnedHere: false })} />
    );

    expect(screen.getByPlaceholderText(/observed-only/i)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /send message/i })
    ).toBeDisabled();

    rerender(<WielderChatInput unit={unit({ status: "complete" })} />);

    expect(screen.getByPlaceholderText(/no longer active/i)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /send message/i })
    ).toBeDisabled();
  });

  it("keeps the prompt text when send fails", async () => {
    const kh = installKh(vi.fn(() => Promise.reject(new Error("offline"))));
    const user = userEvent.setup();
    render(<WielderChatInput unit={unit()} />);

    const input = screen.getByPlaceholderText(/message vaelen/i);
    await user.type(input, "retry later");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(kh.sendPrompt).toHaveBeenCalled();
    });
    expect(input).toHaveValue("retry later");
  });
});
