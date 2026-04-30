/**
 * Open-panel registry for the floating-panel system. Panels coexist
 * (you can have multiple wielder details open side-by-side), don't
 * dismiss on outside click, and stack via z-index. Click a panel's
 * body to bring it to the front; drag its header to reposition.
 *
 * One panel per (kind, key) pair — opening a panel that already exists
 * just refocuses it instead of creating a duplicate.
 */
import { create } from "zustand";

export type PanelKind = "wielder" | "settings" | "kingdom" | "dispatch";

export type Panel = {
  /** Stable handle: `${kind}:${key}` (or `${kind}` for singletons). */
  id: string;
  kind: PanelKind;
  /** Identity within the kind — e.g. unit.id for wielder panels. */
  key?: string;
  title: string;
  x: number;
  y: number;
  width: number;
  /** Optional fixed height. When unset the panel is content-driven
   * with the standard `max-height: calc(100vh - 80px)` on the body.
   * Bodies that want a tab-dependent footprint (e.g. messages-mode
   * wielder panels) call setSize when the tab changes. */
  height?: number;
  z: number;
  /** Kind-specific payload — e.g. `{ initialTab: "messages" }` for
   * wielder panels. The body component reads what it needs. Re-opening
   * an existing panel with new data does NOT replace the prior payload
   * (the panel keeps whatever state the user has been working in). */
  data?: Record<string, unknown>;
};

type State = {
  panels: Panel[];
  zCounter: number;
  openPanel(spec: {
    kind: PanelKind;
    key?: string;
    title: string;
    width?: number;
    data?: Record<string, unknown>;
  }): string;
  closePanel(id: string): void;
  closeKind(kind: PanelKind): void;
  closeAll(): void;
  focusPanel(id: string): void;
  moveTo(id: string, x: number, y: number): void;
  setSize(id: string, size: { width?: number; height?: number | null }): void;
};

const PANEL_OFFSET = 28;

function makeId(kind: PanelKind, key?: string): string {
  return key ? `${kind}:${key}` : kind;
}

/** Roughly center the first panel; cascade subsequent ones down-right
 * so they don't perfectly overlap. Uses viewport size as a hint. */
function nextPosition(existingCount: number, width: number): { x: number; y: number } {
  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  const baseX = Math.max(40, Math.round((w - width) / 2));
  const baseY = Math.max(60, Math.round(h * 0.18));
  return {
    x: baseX + (existingCount % 6) * PANEL_OFFSET,
    y: baseY + (existingCount % 6) * PANEL_OFFSET,
  };
}

export const usePanels = create<State>((set, get) => ({
  panels: [],
  zCounter: 100,
  openPanel({ kind, key, title, width = 420, data }) {
    const id = makeId(kind, key);
    const existing = get().panels.find((p) => p.id === id);
    if (existing) {
      // Already open — bump to top of stack and merge any new data the
      // caller passed (e.g. updated initialTab so the chat icon can
      // switch a parked panel back to the Messages tab).
      const z = get().zCounter + 1;
      set((s) => ({
        zCounter: z,
        panels: s.panels.map((p) =>
          p.id === id
            ? { ...p, z, data: data ? { ...(p.data ?? {}), ...data } : p.data }
            : p
        ),
      }));
      return id;
    }
    const z = get().zCounter + 1;
    const pos = nextPosition(get().panels.length, width);
    set((s) => ({
      zCounter: z,
      panels: [...s.panels, { id, kind, key, title, x: pos.x, y: pos.y, width, z, data }],
    }));
    return id;
  },
  closePanel(id) {
    set((s) => ({ panels: s.panels.filter((p) => p.id !== id) }));
  },
  closeKind(kind) {
    set((s) => ({ panels: s.panels.filter((p) => p.kind !== kind) }));
  },
  closeAll() {
    set({ panels: [] });
  },
  focusPanel(id) {
    set((s) => {
      const target = s.panels.find((p) => p.id === id);
      if (!target) return s;
      const z = s.zCounter + 1;
      return {
        zCounter: z,
        panels: s.panels.map((p) => (p.id === id ? { ...p, z } : p)),
      };
    });
  },
  moveTo(id, x, y) {
    set((s) => ({
      panels: s.panels.map((p) => (p.id === id ? { ...p, x, y } : p)),
    }));
  },
  setSize(id, size) {
    set((s) => ({
      panels: s.panels.map((p) => {
        if (p.id !== id) return p;
        const next: Panel = { ...p };
        if (typeof size.width === "number") next.width = size.width;
        if (size.height === null) delete next.height;
        else if (typeof size.height === "number") next.height = size.height;
        return next;
      }),
    }));
  },
}));
