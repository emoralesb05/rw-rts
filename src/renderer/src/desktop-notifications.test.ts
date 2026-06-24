import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const api = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal("localStorage", api);
  return { api, store };
}

describe("desktop notification settings", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to defaults for malformed persisted settings", async () => {
    installLocalStorage({
      "realmkeeper:notif-settings": JSON.stringify({
        enabled: false,
        quietStartHour: 99,
      }),
    });

    const { getNotifSettings } = await import("./desktop-notifications");

    expect(getNotifSettings()).toMatchObject({
      enabled: true,
      fireImportant: false,
      quietStartHour: 22,
      quietEndHour: 8,
    });
  });

  it("persists only schema-valid setting updates", async () => {
    const { api, store } = installLocalStorage();
    const { setNotifSettings } = await import("./desktop-notifications");

    setNotifSettings({ fireImportant: true, quietStartHour: 7 });

    expect(api.setItem).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(store.get("realmkeeper:notif-settings") ?? "{}")
    ).toMatchObject({
      enabled: true,
      fireImportant: true,
      quietStartHour: 7,
      quietEndHour: 8,
    });

    setNotifSettings({ quietEndHour: 24 } as never);

    expect(api.setItem).toHaveBeenCalledTimes(1);
  });
});
