import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { app } from "electron";
import { SOCKET_PATH } from "./adapters/hook-bridge";
import { ClaudeSettingsSchema, type ClaudeSettings } from "@shared/schemas";

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const HOOK_MARKER = "keykeeper-managed";

const KEYKEEPER_DIR = join(homedir(), ".keykeeper");
const INSTALLED_SCRIPT_PATH = join(KEYKEEPER_DIR, "keykeeper-hook");

const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "Stop",
  "SubagentStop",
];

/**
 * Path that the user's Claude/Cursor/Codex configs reference. Stable
 * across app moves and updates because it's in the user's own home dir,
 * not inside the app bundle. Populated by `syncHookScript()` on every
 * boot from the bundled source.
 */
export function getHookScriptPath(): string {
  return INSTALLED_SCRIPT_PATH;
}

/**
 * Resolve the bundled source script (in dev: the repo's `bin/`; when
 * packaged: `Resources/bin/` outside app.asar via electron-builder's
 * `asarUnpack`). Used by `syncHookScript()` to copy into ~/.keykeeper/.
 */
function getBundledScriptPath(): string {
  const isDev = !app.isPackaged;
  return isDev
    ? join(app.getAppPath(), "bin", "keykeeper-hook")
    : join(app.getAppPath(), "..", "bin", "keykeeper-hook");
}

/**
 * Copy the bundled hook script into ~/.keykeeper/keykeeper-hook on
 * every app boot, chmod +x. Cheap (small file) and keeps the installed
 * copy in sync with whatever ships in the current app version (or the
 * current dev source). Idempotent — safe to call repeatedly.
 *
 * Call this in `app.whenReady()` BEFORE installing or running hooks.
 */
export function syncHookScript(): void {
  try {
    mkdirSync(KEYKEEPER_DIR, { recursive: true });
    const src = getBundledScriptPath();
    if (existsSync(src)) {
      copyFileSync(src, INSTALLED_SCRIPT_PATH);
      chmodSync(INSTALLED_SCRIPT_PATH, 0o755);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[keykeeper] failed to sync hook script:", err);
  }
}

export function ensureHookScriptExecutable() {
  // The script lives at ~/.keykeeper/keykeeper-hook after syncHookScript().
  // Belt-and-suspenders chmod in case the boot-time copy was missed.
  if (existsSync(INSTALLED_SCRIPT_PATH)) {
    try {
      chmodSync(INSTALLED_SCRIPT_PATH, 0o755);
    } catch {
      // ignore
    }
  }
}

function loadSettings(): ClaudeSettings {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    const parsed = ClaudeSettingsSchema.safeParse(
      JSON.parse(readFileSync(SETTINGS_PATH, "utf8"))
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function saveSettings(settings: ClaudeSettings) {
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export function isInstalled(): boolean {
  const s = loadSettings();
  const hooks = s?.hooks ?? {};
  return HOOK_EVENTS.every((evt) =>
    (hooks[evt] ?? []).some((entry: any) =>
      (entry.hooks ?? []).some((h: any) => h.command?.includes(HOOK_MARKER))
    )
  );
}

export function installHooks() {
  ensureHookScriptExecutable();
  const scriptPath = getHookScriptPath();
  const command = `${scriptPath} # ${HOOK_MARKER}`;

  const settings = loadSettings();
  settings.hooks = settings.hooks ?? {};

  for (const evt of HOOK_EVENTS) {
    settings.hooks[evt] = (settings.hooks[evt] ?? []).filter((entry) =>
      !(entry.hooks ?? []).some((h: any) => h.command?.includes(HOOK_MARKER))
    );
    settings.hooks[evt].push({
      matcher: "*",
      hooks: [{ type: "command", command }],
    });
  }

  saveSettings(settings);
}

export function uninstallHooks() {
  const settings = loadSettings();
  if (!settings.hooks) return;
  for (const evt of HOOK_EVENTS) {
    if (!settings.hooks[evt]) continue;
    settings.hooks[evt] = settings.hooks[evt].filter((entry: any) =>
      !(entry.hooks ?? []).some((h: any) => h.command?.includes(HOOK_MARKER))
    );
    if (settings.hooks[evt].length === 0) delete settings.hooks[evt];
  }
  saveSettings(settings);
}

export function getStatus() {
  return {
    installed: isInstalled(),
    socketPath: SOCKET_PATH,
    hookScriptPath: getHookScriptPath(),
  };
}
