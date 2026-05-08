// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LetterCard } from "./LetterCard";
import { useStore } from "../../store";
import { AppToastProvider } from "../components/kit/ToastLayer";
import { TooltipProvider } from "../components/primitives/Tooltip";
import type { Letter } from "@shared/events";

function renderCard(letter: Letter) {
  return render(
    <TooltipProvider>
      <AppToastProvider>
        <LetterCard letter={letter} />
      </AppToastProvider>
    </TooltipProvider>
  );
}

function baseLetter(overrides: Partial<Letter> = {}): Letter {
  return {
    id: "letter-1",
    createdAt: Date.now(),
    severity: "important",
    title: "Approve Bash",
    body: "Run pnpm test?",
    actions: [],
    ...overrides,
  };
}

describe("LetterCard", () => {
  afterEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it("renders permission actions and sends a deny reason with the clicked action", async () => {
    const user = userEvent.setup();
    const applyLetterAction = vi.fn();
    const letter = baseLetter({
      risk: "high",
      actions: [
        {
          label: "allow",
          action: { kind: "permission-allow", requestId: "req-1" },
        },
        {
          label: "deny",
          action: { kind: "permission-deny", requestId: "req-1" },
        },
      ],
    });

    useStore.setState({ applyLetterAction });
    renderCard(letter);

    expect(screen.getByText("HIGH RISK")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "allow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "deny" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Deny reason"), "too broad");
    await user.click(screen.getByRole("button", { name: "deny" }));

    expect(applyLetterAction).toHaveBeenCalledWith(
      letter,
      expect.objectContaining({
        kind: "permission-deny",
        requestId: "req-1",
        message: "too broad",
      })
    );
  });

  it("supports the permission keyboard shortcuts from the card body", async () => {
    const user = userEvent.setup();
    const applyLetterAction = vi.fn();
    const letter = baseLetter({
      actions: [
        {
          label: "allow",
          action: { kind: "permission-allow", requestId: "req-2" },
        },
        {
          label: "deny",
          action: { kind: "permission-deny", requestId: "req-2" },
        },
      ],
    });

    useStore.setState({ applyLetterAction });
    renderCard(letter);

    screen.getByRole("group").focus();
    await user.keyboard("a");

    expect(applyLetterAction).toHaveBeenCalledWith(
      letter,
      expect.objectContaining({
        kind: "permission-allow",
        requestId: "req-2",
      })
    );
  });

  it("pans to the target world when an informational letter body is clicked", async () => {
    const user = userEvent.setup();
    const selectWorld = vi.fn();
    const letter = baseLetter({
      title: "Seal available",
      worldId: "world-1",
      actions: [{ label: "dismiss", action: { kind: "dismiss" } }],
    });

    useStore.setState({ selectWorld });
    renderCard(letter);

    await user.click(screen.getByRole("button", { name: /seal available/i }));

    expect(selectWorld).toHaveBeenCalledWith("world-1");
  });
});
