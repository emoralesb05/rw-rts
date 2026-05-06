/**
 * Gemini hook installer — manages our entries in ~/.gemini/settings.json.
 *
 * Gemini CLI's hook schema mirrors Claude's JSON structure, but the event
 * names and no-op behavior differ:
 *   - events are PascalCase: SessionStart, BeforeAgent, BeforeTool, etc.
 *   - hook commands should return JSON on stdout even for no-op
 *   - Notification/ToolPermission is observational only
 *
 * We tag every command with `--tool gemini` so the bridge can disambiguate
 * Gemini's PascalCase events from Claude and Codex.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { SOCKET_PATH } from "./adapters/hook-bridge";
import { getHookScriptPath, ensureHookScriptExecutable } from "./hook-installer";

const GEMINI_SETTINGS_PATH = join(homedir(), ".gemini", "settings.json");
const HOOK_MARKER = "keykeeper-managed";
const GEMINI_HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "BeforeAgent",
  "BeforeModel",
  "BeforeToolSelection",
  "BeforeTool",
  "AfterTool",
  "AfterModel",
  "AfterAgent",
  "PreCompress",
  "Notification",
] as const;

type GeminiHook = {
  type: "command";
  command: string;
  name?: string;
  timeout?: number;
  description?: string;
};
type GeminiHookEntry = {
  matcher?: string;
  hooks?: GeminiHook[];
};
type GeminiSettings = {
  hooks?: Record<string, GeminiHookEntry[]>;
  [key: string]: unknown;
};

function loadSettings(): GeminiSettings {
  if (!existsSync(GEMINI_SETTINGS_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(GEMINI_SETTINGS_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSettings(settings: GeminiSettings) {
  mkdirSync(dirname(GEMINI_SETTINGS_PATH), { recursive: true });
  writeFileSync(GEMINI_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function isOurEntry(entry: GeminiHookEntry): boolean {
  return (entry.hooks ?? []).some((h) => h.command?.includes(HOOK_MARKER));
}

export function isGeminiInstalled(): boolean {
  const settings = loadSettings();
  const hooks = settings.hooks ?? {};
  return GEMINI_HOOK_EVENTS.every((evt) =>
    (hooks[evt] ?? []).some(isOurEntry)
  );
}

export function installGeminiHooks() {
  ensureHookScriptExecutable();
  const scriptPath = getHookScriptPath();
  const command = `${scriptPath} --tool gemini # ${HOOK_MARKER}`;
  const settings = loadSettings();
  settings.hooks = settings.hooks ?? {};

  for (const evt of GEMINI_HOOK_EVENTS) {
    const current = settings.hooks[evt] ?? [];
    settings.hooks[evt] = current.filter((entry) => !isOurEntry(entry));
    settings.hooks[evt].push({
      matcher: "*",
      hooks: [
        {
          name: "keykeeper",
          type: "command",
          command,
          timeout: 5000,
          description: "Forward Gemini CLI activity to Keykeeper.",
        },
      ],
    });
  }

  saveSettings(settings);
}

export function uninstallGeminiHooks() {
  const settings = loadSettings();
  if (!settings.hooks) return;
  for (const evt of GEMINI_HOOK_EVENTS) {
    const list = settings.hooks[evt];
    if (!list) continue;
    settings.hooks[evt] = list.filter((entry) => !isOurEntry(entry));
    if (settings.hooks[evt].length === 0) delete settings.hooks[evt];
  }
  saveSettings(settings);
}

export function getGeminiHooksStatus() {
  return {
    installed: isGeminiInstalled(),
    socketPath: SOCKET_PATH,
    hookScriptPath: getHookScriptPath(),
    hooksConfigPath: GEMINI_SETTINGS_PATH,
  };
}
