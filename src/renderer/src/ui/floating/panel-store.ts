/**
 * Open-panel registry for the floating-panel system. Panels coexist
 * (you can have multiple wielder details open side-by-side), don't
 * dismiss on outside click, and stack via z-index. Click a panel's
 * body to bring it to the front; drag its header to reposition.
 *
 * One panel per (kind, key) pair — opening a panel that already exists
 * just refocuses it instead of creating a duplicate.
 *
 * The chat drawer is separate from the floating-panel list — it's a
 * singleton anchored-right surface with its own state (openTabs,
 * activeTab, width). See `drawer` slice + `openDrawerTab` etc. below.
 */
import { create } from "zustand";

export type PanelKind = "wielder" | "settings" | "kingdom" | "dispatch";

export type DrawerState = {
  /** Wielder ids with an open chat tab, in browser-style order (most-
   * recently-opened on the right). */
  openTabs: string[];
  /** The currently visible tab. Null only briefly between actions. */
  activeTab: string | null;
  /** User-resizable width in px when expanded. Persisted to localStorage. */
  width: number;
  /** Z-index, sourced from the same `zCounter` floating panels use.
   * The drawer behaves like any other dialog — clicking it brings it
   * to the top of the stack, clicking a status panel brings that
   * above the drawer. */
  z: number;
  /** When true, the drawer collapses to a thin vertical strip showing
   * just status dots + an expand chevron. Click any dot or the chevron
   * to restore. The user's expanded `width` is preserved across
   * minimize/restore cycles. */
  minimized: boolean;
};

const DRAWER_WIDTH_KEY = "keykeeper:drawer:width";
const DRAWER_DEFAULT_WIDTH = () =>
  typeof window !== "undefined"
    ? Math.max(560, Math.round(window.innerWidth * 0.5))
    : 720;
const DRAWER_MIN_WIDTH = 360;
const DRAWER_MAX_WIDTH_RATIO = 0.8;

function loadDrawerWidth(): number {
  if (typeof window === "undefined") return DRAWER_DEFAULT_WIDTH();
  try {
    const raw = window.localStorage.getItem(DRAWER_WIDTH_KEY);
    if (raw == null) return DRAWER_DEFAULT_WIDTH();
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= DRAWER_MIN_WIDTH ? n : DRAWER_DEFAULT_WIDTH();
  } catch {
    return DRAWER_DEFAULT_WIDTH();
  }
}

function persistDrawerWidth(w: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAWER_WIDTH_KEY, String(w));
  } catch {
    // ignore quota / private-mode failures
  }
}

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
  /** Drawer state, or `null` when the drawer is closed (no open tabs). */
  drawer: DrawerState | null;
  /** AlertsHUD's z-index. Bumps to the top of the stack when a new
   * permission letter arrives or the user clicks on the alerts panel.
   * `null` means default z (let CSS handle it). */
  alertsZ: number | null;
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
  /** Open (or focus) a chat tab in the drawer. Creates the drawer if
   * not already open. Most-recently-opened tabs append to the right.
   * Also bumps the drawer's z so it surfaces above existing panels. */
  openDrawerTab(wielderId: string): void;
  /** Close one tab. If it was the last tab, closes the drawer too. */
  closeDrawerTab(wielderId: string): void;
  /** Switch the active tab without changing the open list. */
  setDrawerActiveTab(wielderId: string): void;
  /** Resize the drawer; clamps and persists to localStorage. */
  setDrawerWidth(width: number): void;
  /** Bring the drawer to the top of the z-stack (called on click/focus). */
  focusDrawer(): void;
  /** Close the drawer entirely (clears all tabs). */
  closeDrawer(): void;
  /** Toggle the drawer's minimized state — keeps tabs intact, collapses
   * to a thin strip when minimized. */
  toggleDrawerMinimized(): void;
  /** Force the drawer expanded (used when restoring from minimized via
   * a tab-dot click). */
  expandDrawer(): void;
  /** Bring AlertsHUD to the top of the z-stack — called when a new
   * permission letter arrives or the user clicks on it. */
  focusAlerts(): void;
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
  // Start the z-counter high so panels sit above Streamdown plugin
  // overlays (Mermaid in particular renders its expand-to-full-view
  // backdrop in the high-thousands). 10000+ keeps us clear.
  zCounter: 10_000,
  drawer: null,
  alertsZ: null,
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
    // Only close floating panels — leave the chat drawer alone. The
    // drawer has its own less-destructive "minimize" affordance for
    // getting out of the way without losing tabs, and its own ✕ button
    // for the rare case the user wants to clear all chats. Including
    // it here would be a footgun ("oops, lost my 4 open conversations").
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
  openDrawerTab(wielderId) {
    set((s) => {
      const z = s.zCounter + 1;
      const cur = s.drawer;
      if (!cur) {
        return {
          zCounter: z,
          drawer: {
            openTabs: [wielderId],
            activeTab: wielderId,
            width: loadDrawerWidth(),
            z,
            minimized: false,
          },
        };
      }
      // Already open — just focus the tab; if it's not in the list yet,
      // append on the right (browser-style). Also bump z so the drawer
      // surfaces above any panel that may have stolen focus, and
      // restore from minimized so the user actually sees the tab.
      const has = cur.openTabs.includes(wielderId);
      return {
        zCounter: z,
        drawer: {
          ...cur,
          openTabs: has ? cur.openTabs : [...cur.openTabs, wielderId],
          activeTab: wielderId,
          z,
          minimized: false,
        },
      };
    });
  },
  closeDrawerTab(wielderId) {
    set((s) => {
      const cur = s.drawer;
      if (!cur) return s;
      const remaining = cur.openTabs.filter((id) => id !== wielderId);
      if (remaining.length === 0) return { drawer: null };
      // If the closed tab was active, switch to its right neighbor (or
      // left if it was the rightmost).
      let nextActive = cur.activeTab;
      if (cur.activeTab === wielderId) {
        const idx = cur.openTabs.indexOf(wielderId);
        nextActive = remaining[Math.min(idx, remaining.length - 1)];
      }
      return { drawer: { ...cur, openTabs: remaining, activeTab: nextActive } };
    });
  },
  setDrawerActiveTab(wielderId) {
    set((s) => {
      if (!s.drawer || !s.drawer.openTabs.includes(wielderId)) return s;
      return { drawer: { ...s.drawer, activeTab: wielderId } };
    });
  },
  setDrawerWidth(width) {
    const w =
      typeof window !== "undefined"
        ? Math.max(
            DRAWER_MIN_WIDTH,
            Math.min(Math.round(window.innerWidth * DRAWER_MAX_WIDTH_RATIO), Math.round(width))
          )
        : Math.max(DRAWER_MIN_WIDTH, Math.round(width));
    persistDrawerWidth(w);
    set((s) => (s.drawer ? { drawer: { ...s.drawer, width: w } } : s));
  },
  focusDrawer() {
    set((s) => {
      if (!s.drawer) return s;
      const z = s.zCounter + 1;
      return { zCounter: z, drawer: { ...s.drawer, z } };
    });
  },
  closeDrawer() {
    set({ drawer: null });
  },
  toggleDrawerMinimized() {
    set((s) => (s.drawer ? { drawer: { ...s.drawer, minimized: !s.drawer.minimized } } : s));
  },
  expandDrawer() {
    set((s) =>
      s.drawer && s.drawer.minimized ? { drawer: { ...s.drawer, minimized: false } } : s
    );
  },
  focusAlerts() {
    set((s) => {
      const z = s.zCounter + 1;
      return { zCounter: z, alertsZ: z };
    });
  },
}));
