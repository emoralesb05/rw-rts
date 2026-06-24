// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanelBody } from "./SettingsPanelBody";
import { usePanels } from "./panel-store";
import { AppToastProvider } from "../components/kit/ToastLayer";
import type { AppSettings, WorkspaceRootValidation } from "@shared/schemas";

function installRw({
  settings = { workspaceRoot: "/Users/ed/Github", exclude: ["node_modules"] },
  validation = { valid: true, expanded: "/Users/ed/Github" },
  saveSettings = vi.fn(() => Promise.resolve(true)),
}: {
  settings?: AppSettings;
  validation?: WorkspaceRootValidation;
  saveSettings?: ReturnType<typeof vi.fn>;
} = {}) {
  const rw = {
    getSettings: vi.fn(() => Promise.resolve(settings)),
    validateWorkspaceRoot: vi.fn(() => Promise.resolve(validation)),
    saveSettings,
  };

  Object.defineProperty(window, "rw", {
    configurable: true,
    writable: true,
    value: rw,
  });

  return rw;
}

function renderSettings(onSaved = vi.fn()) {
  usePanels.setState({
    panels: [
      {
        id: "settings",
        kind: "settings",
        title: "Settings",
        x: 0,
        y: 0,
        width: 420,
        z: 10_001,
      },
    ],
  });

  render(
    <AppToastProvider>
      <SettingsPanelBody onSaved={onSaved} />
    </AppToastProvider>
  );

  return { onSaved };
}

describe("SettingsPanelBody", () => {
  afterEach(() => {
    usePanels.setState(usePanels.getInitialState(), true);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads, validates, saves normalized settings, and closes the panel", async () => {
    const rw = installRw();
    const user = userEvent.setup();
    const { onSaved } = renderSettings();

    expect(await screen.findByDisplayValue("/Users/ed/Github")).toBeVisible();
    expect(screen.getByDisplayValue("node_modules")).toBeVisible();

    await waitFor(() => {
      expect(rw.validateWorkspaceRoot).toHaveBeenCalledWith("/Users/ed/Github");
    });
    expect(screen.getByText(/resolves to \/Users\/ed\/Github/i)).toBeVisible();

    const exclude = screen.getByLabelText(/exclude patterns/i);
    await user.clear(exclude);
    await user.type(exclude, "node_modules\n# comment\nforks/*\n\n");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(rw.saveSettings).toHaveBeenCalledWith({
        workspaceRoot: "/Users/ed/Github",
        exclude: ["node_modules", "forks/*"],
      });
    });
    expect(onSaved).toHaveBeenCalled();
    expect(usePanels.getState().panels).toEqual([]);
    expect(screen.getByText("Settings saved")).toBeVisible();
  });

  it("keeps save disabled when workspace validation fails", async () => {
    const rw = installRw({
      validation: {
        valid: false,
        expanded: "/missing",
        reason: "not-found",
      },
    });
    renderSettings();

    expect(await screen.findByDisplayValue("/Users/ed/Github")).toBeVisible();

    await waitFor(() => {
      expect(rw.validateWorkspaceRoot).toHaveBeenCalledWith("/Users/ed/Github");
    });
    expect(screen.getByText(/directory doesn't exist/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(rw.saveSettings).not.toHaveBeenCalled();
  });

  it("reports save failures without closing settings", async () => {
    const rw = installRw({
      saveSettings: vi.fn(() => Promise.reject(new Error("disk full"))),
    });
    const user = userEvent.setup();
    renderSettings();

    await screen.findByDisplayValue("/Users/ed/Github");
    await waitFor(() => {
      expect(rw.validateWorkspaceRoot).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Settings save failed")).toBeVisible();
    expect(usePanels.getState().panels).toHaveLength(1);
  });
});
