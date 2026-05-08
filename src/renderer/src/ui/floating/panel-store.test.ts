// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { usePanels } from "./panel-store";

describe("panel store", () => {
  afterEach(() => {
    usePanels.setState(usePanels.getInitialState(), true);
    window.localStorage.clear();
  });

  it("deduplicates floating panels and merges re-open data", () => {
    const firstId = usePanels.getState().openPanel({
      kind: "settings",
      title: "Settings",
      width: 420,
      data: { initialTab: "general" },
    });
    const firstPanel = usePanels.getState().panels[0];

    const secondId = usePanels.getState().openPanel({
      kind: "settings",
      title: "Settings",
      data: { source: "shortcut" },
    });

    expect(secondId).toBe(firstId);
    expect(usePanels.getState().panels).toEqual([
      expect.objectContaining({
        id: "settings",
        title: "Settings",
        width: 420,
        z: expect.any(Number),
        data: { initialTab: "general", source: "shortcut" },
      }),
    ]);
    expect(usePanels.getState().panels[0].z).toBeGreaterThan(firstPanel.z);
  });

  it("closes floating panels without closing the chat drawer", () => {
    usePanels.getState().openPanel({ kind: "settings", title: "Settings" });
    usePanels.getState().openDrawerTab("unit-1");

    usePanels.getState().closeAll();

    expect(usePanels.getState().panels).toEqual([]);
    expect(usePanels.getState().drawer).toMatchObject({
      openTabs: ["unit-1"],
      activeTab: "unit-1",
    });
  });

  it("maintains drawer tab ordering and active tab fallback", () => {
    usePanels.getState().openDrawerTab("unit-1");
    usePanels.getState().openDrawerTab("unit-2");
    usePanels.getState().openDrawerTab("unit-3");

    expect(usePanels.getState().drawer).toMatchObject({
      openTabs: ["unit-1", "unit-2", "unit-3"],
      activeTab: "unit-3",
    });

    usePanels.getState().setDrawerActiveTab("unit-2");
    usePanels.getState().closeDrawerTab("unit-2");

    expect(usePanels.getState().drawer).toMatchObject({
      openTabs: ["unit-1", "unit-3"],
      activeTab: "unit-3",
    });

    usePanels.getState().closeDrawerTab("unit-3");
    expect(usePanels.getState().drawer).toMatchObject({
      openTabs: ["unit-1"],
      activeTab: "unit-1",
    });

    usePanels.getState().closeDrawerTab("unit-1");
    expect(usePanels.getState().drawer).toBeNull();
  });

  it("clamps and persists drawer width", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1000,
    });

    usePanels.getState().openDrawerTab("unit-1");
    usePanels.getState().setDrawerWidth(1200);

    expect(usePanels.getState().drawer?.width).toBe(800);
    expect(window.localStorage.getItem("keykeeper:drawer:width")).toBe("800");

    usePanels.getState().setDrawerWidth(100);

    expect(usePanels.getState().drawer?.width).toBe(360);
    expect(window.localStorage.getItem("keykeeper:drawer:width")).toBe("360");
  });

  it("tracks alert focus in the shared z-stack", () => {
    usePanels.getState().openPanel({ kind: "kingdom", title: "Kingdom" });
    const panelZ = usePanels.getState().panels[0].z;

    usePanels.getState().focusAlerts();

    expect(usePanels.getState().alertsZ).toBeGreaterThan(panelZ);
    expect(usePanels.getState().zCounter).toBe(usePanels.getState().alertsZ);
  });
});
