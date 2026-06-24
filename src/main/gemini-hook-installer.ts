/**
 * Gemini hook installer — manages our entries in ~/.gemini/settings.json.
 *
 * Gemini CLI's hook schema mirrors Claude's JSON structure, but the event
 * names and no-op behavior differ:
 *   - events are PascalCase: SessionStart, BeforeAgent, BeforeTool, etc.
 *   - hook commands should return JSON on stdout even for no-op
 *   - BeforeTool is the only hook that can block execution; Notification is
 *     observational only and is not rendered as a Realmkeeper decision
 *
 * We tag every command with `--tool gemini` so the bridge can disambiguate
 * Gemini's PascalCase events from Claude and Codex.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { SOCKET_PATH } from "./adapters/hook-bridge";
import {
  getHookScriptPath,
  ensureHookScriptExecutable,
} from "./hook-installer";
import {
  GeminiSettingsSchema,
  type GeminiSettings,
  type JsonHookEntry,
} from "@shared/schemas";

const GEMINI_SETTINGS_PATH = join(homedir(), ".gemini", "settings.json");
const GEMINI_POLICY_PATH = join(
  homedir(),
  ".gemini",
  "policies",
  "realmkeeper-managed.toml"
);
const HOOK_MARKER = "realmkeeper-managed";
const GEMINI_OBSERVE_TIMEOUT_MS = 5000;
const GEMINI_PERMISSION_TIMEOUT_MS = 10 * 60 * 1000;
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

const GEMINI_POLICY = `# realmkeeper-managed
# Realmkeeper owns Gemini tool approval. The user policy suppresses Gemini's
# native confirmation prompt after the BeforeTool hook has already asked
# Realmkeeper. The managed hook command sets REALMKEEPER_GEMINI_FAIL_CLOSED=1,
# so tool execution is denied if Realmkeeper is unavailable.

[[rule]]
toolName = "run_shell_command"
decision = "allow"
priority = 999
allowRedirection = true

[[rule]]
toolName = "*"
decision = "allow"
priority = 998
`;

function timeoutForEvent(evt: (typeof GEMINI_HOOK_EVENTS)[number]): number {
  return evt === "BeforeTool"
    ? GEMINI_PERMISSION_TIMEOUT_MS
    : GEMINI_OBSERVE_TIMEOUT_MS;
}

function loadSettings(): GeminiSettings {
  if (!existsSync(GEMINI_SETTINGS_PATH)) return {};
  try {
    const parsed = GeminiSettingsSchema.safeParse(
      JSON.parse(readFileSync(GEMINI_SETTINGS_PATH, "utf8"))
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function saveSettings(settings: GeminiSettings) {
  mkdirSync(dirname(GEMINI_SETTINGS_PATH), { recursive: true });
  writeFileSync(GEMINI_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function isOurEntry(entry: JsonHookEntry): boolean {
  return (entry.hooks ?? []).some((h) => h.command?.includes(HOOK_MARKER));
}

function isFailClosedEntry(entry: JsonHookEntry): boolean {
  return (entry.hooks ?? []).some(
    (h) =>
      h.command?.includes(HOOK_MARKER) &&
      h.command.includes("REALMKEEPER_GEMINI_FAIL_CLOSED=1")
  );
}

function isManagedPolicyInstalled(): boolean {
  if (!existsSync(GEMINI_POLICY_PATH)) return false;
  try {
    return readFileSync(GEMINI_POLICY_PATH, "utf8").includes(HOOK_MARKER);
  } catch {
    return false;
  }
}

function installManagedPolicy() {
  mkdirSync(dirname(GEMINI_POLICY_PATH), { recursive: true });
  writeFileSync(GEMINI_POLICY_PATH, GEMINI_POLICY);
}

function uninstallManagedPolicy() {
  if (!isManagedPolicyInstalled()) return;
  rmSync(GEMINI_POLICY_PATH, { force: true });
}

export function isGeminiInstalled(): boolean {
  const settings = loadSettings();
  const hooks = settings.hooks ?? {};
  const hooksInstalled = GEMINI_HOOK_EVENTS.every((evt) =>
    (hooks[evt] ?? []).some(isOurEntry)
  );
  const beforeToolFailClosed = (hooks.BeforeTool ?? []).some(isFailClosedEntry);
  return hooksInstalled && beforeToolFailClosed && isManagedPolicyInstalled();
}

export function installGeminiHooks() {
  ensureHookScriptExecutable();
  const scriptPath = getHookScriptPath();
  const command = `REALMKEEPER_GEMINI_FAIL_CLOSED=1 ${scriptPath} --tool gemini # ${HOOK_MARKER}`;
  const settings = loadSettings();
  settings.hooks = settings.hooks ?? {};

  for (const evt of GEMINI_HOOK_EVENTS) {
    const current = settings.hooks[evt] ?? [];
    settings.hooks[evt] = current.filter((entry) => !isOurEntry(entry));
    settings.hooks[evt].push({
      matcher: "*",
      hooks: [
        {
          name: "realmkeeper",
          type: "command",
          command,
          timeout: timeoutForEvent(evt),
          description: "Forward Gemini CLI activity to Realmkeeper.",
        },
      ],
    });
  }

  installManagedPolicy();
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
  uninstallManagedPolicy();
  saveSettings(settings);
}

export function getGeminiHooksStatus() {
  return {
    installed: isGeminiInstalled(),
    socketPath: SOCKET_PATH,
    hookScriptPath: getHookScriptPath(),
    hooksConfigPath: GEMINI_SETTINGS_PATH,
    policyConfigPath: GEMINI_POLICY_PATH,
  };
}
