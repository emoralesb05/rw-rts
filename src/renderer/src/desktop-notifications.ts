/**
 * Desktop OS notifications for Critical / Important letters.
 *
 * Phase 2B item #17 (Q40-reframed: desktop OS notifications, not Web
 * Push, since mobile was killed per Q29). Uses the renderer's standard
 * Notification API, which Electron passes through to the OS notification
 * center. No VAPID keys, no service worker, no push provider.
 *
 * Triggers (per Q30=d):
 * - Critical letters always fire
 * - Important letters fire if user has the toggle on (default off — they
 *   land in the side panel anyway, push is for higher-stakes events)
 * - Permission requests (#18) and plan approvals will be added when
 *   those upstream concepts ship.
 *
 * Quiet hours: 22:00–08:00 by default, configurable in localStorage.
 * Click → focus window via Electron's main process (best-effort; if
 * unavailable, opening the app is on the user).
 */

import { useStore } from "./store";
import type { Letter, LetterSeverity } from "@shared/events";

type NotifSettings = {
  enabled: boolean;
  fireCritical: boolean;
  fireImportant: boolean;
  fireNotable: boolean;
  quietStartHour: number; // 0-23 inclusive
  quietEndHour: number;   // 0-23 inclusive (wraps if start > end)
};

const SETTINGS_KEY = "keykeeper:notif-settings";

const DEFAULTS: NotifSettings = {
  enabled: true,
  fireCritical: true,
  fireImportant: false,
  fireNotable: false,
  quietStartHour: 22,
  quietEndHour: 8,
};

function loadSettings(): NotifSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotifSettings>) };
  } catch {
    return DEFAULTS;
  }
}

export function getNotifSettings(): NotifSettings {
  return loadSettings();
}

export function setNotifSettings(next: Partial<NotifSettings>): void {
  const merged = { ...loadSettings(), ...next };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
}

function inQuietHours(now: Date, settings: NotifSettings): boolean {
  const h = now.getHours();
  const start = settings.quietStartHour;
  const end = settings.quietEndHour;
  if (start === end) return false;
  // Wraps midnight when start > end (e.g., 22 → 8).
  return start > end ? h >= start || h < end : h >= start && h < end;
}

function shouldFireFor(severity: LetterSeverity, settings: NotifSettings): boolean {
  if (!settings.enabled) return false;
  if (severity === "critical") return settings.fireCritical;
  if (severity === "important") return settings.fireImportant;
  return settings.fireNotable;
}

let permissionRequested = false;
async function ensurePermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (permissionRequested) return false;
  permissionRequested = true;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

async function fireNotification(letter: Letter): Promise<void> {
  const ok = await ensurePermission();
  if (!ok) return;
  const tag = `keykeeper-letter-${letter.id}`;
  const title =
    letter.severity === "critical"
      ? `⚠ ${letter.title}`
      : letter.severity === "important"
        ? `✦ ${letter.title}`
        : letter.title;
  const body = letter.body ?? "";
  const notif = new Notification(title, {
    body,
    tag,
    silent: false,
  });
  notif.onclick = () => {
    // Focus the renderer window (Electron passes window.focus through
    // to BrowserWindow.focus). Then center the camera on the relevant
    // world if the letter has one.
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    if (letter.worldId) {
      useStore.getState().setCameraTarget(letter.worldId);
    }
    notif.close();
  };
  // OS will keep the notification visible per its own policy.
  // Auto-dismiss after 6s for non-critical to keep the tray tidy.
  if (letter.severity !== "critical") {
    setTimeout(() => notif.close(), 6_000);
  }
}

let lastSeenLetterId: string | null = null;

/**
 * Subscribe to the store and fire notifications when new letters arrive.
 * Returns an unsubscribe function. Call once at app boot.
 */
export function attachLetterNotifications(): () => void {
  // Initialize last-seen to whatever's already in the store at attach time
  // so we don't re-fire on existing letters.
  const initial = useStore.getState().letters;
  lastSeenLetterId = initial[0]?.id ?? null;

  return useStore.subscribe((state) => {
    const top = state.letters[0];
    if (!top || top.id === lastSeenLetterId) return;

    // Find any letters added since last seen. Letters are stored newest-first
    // (per store's letter cap + collapse logic).
    const newOnes: Letter[] = [];
    for (const l of state.letters) {
      if (l.id === lastSeenLetterId) break;
      newOnes.push(l);
    }
    lastSeenLetterId = top.id;

    const settings = loadSettings();
    if (inQuietHours(new Date(), settings)) return;

    // Fire in chronological order (oldest of the new ones first).
    for (const l of newOnes.reverse()) {
      if (!shouldFireFor(l.severity, settings)) continue;
      void fireNotification(l);
    }
  });
}
