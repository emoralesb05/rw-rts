// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CompactHudContext } from "./hud-prefs";
import { HudWidget } from "./HudWidget";

it("keeps compact peeks separate from expanded preferences and removes hidden controls from focus", () => {
  localStorage.clear();
  const content = (compact: boolean) => (
    <CompactHudContext.Provider value={compact}>
      <HudWidget anchor="top-left" title="Wielders">
        <button>Inspect agent</button>
      </HudWidget>
    </CompactHudContext.Provider>
  );
  const view = render(content(true));
  expect(
    screen.getByRole("button", { name: "Expand Wielders" })
  ).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("Inspect agent").closest("[inert]")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Expand Wielders" }));
  expect(screen.getByText("Inspect agent").closest("[inert]")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Collapse Wielders" }));
  view.rerender(content(false));
  expect(
    screen.getByRole("button", { name: "Collapse Wielders" })
  ).toBeVisible();
  view.rerender(content(true));
  act(() =>
    window.dispatchEvent(
      new CustomEvent("rw:expand-hud", { detail: { title: "Wielders" } })
    )
  );
  expect(
    screen.getByRole("button", { name: "Collapse Wielders" })
  ).toBeVisible();
});

it("does not hide permission alerts when compact mode is enabled", () => {
  localStorage.clear();
  render(
    <CompactHudContext.Provider value={true}>
      <HudWidget anchor="top-right" title="Alerts">
        <button>Review permission</button>
      </HudWidget>
    </CompactHudContext.Provider>
  );
  expect(
    screen.getByRole("button", { name: "Review permission" })
  ).toBeVisible();
});
