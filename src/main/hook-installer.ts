import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { app } from "electron";
import { SOCKET_PATH } from "./adapters/claude-hook";

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const HOOK_MARKER = "kh-rts-managed";

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

export function getHookScriptPath(): string {
  const isDev = !app.isPackaged;
  return isDev
    ? join(app.getAppPath(), "bin", "kh-rts-hook")
    : join(app.getAppPath(), "..", "bin", "kh-rts-hook");
}

export function ensureHookScriptExecutable() {
  const path = getHookScriptPath();
  if (existsSync(path)) {
    try {
      chmodSync(path, 0o755);
    } catch {
      // ignore
    }
  }
}

function loadSettings(): any {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(settings: any) {
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
    settings.hooks[evt] = (settings.hooks[evt] ?? []).filter((entry: any) =>
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
