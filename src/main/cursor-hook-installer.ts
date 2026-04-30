/**
 * Cursor hook installer — manages our entries in ~/.cursor/hooks.json.
 *
 * We register hooks across multiple events so the bridge becomes the
 * full observability channel for Cursor sessions (replacing the older
 * SQLite poller in adapters/cursor.ts):
 *
 *   sessionStart        → session_start event       (fire-and-forget)
 *   sessionEnd          → session_end event         (fire-and-forget)
 *   stop                → session_end event         (fire-and-forget)
 *   beforeSubmitPrompt  → user_prompt event         (returns {continue:true})
 *   preToolUse          → tool_use event            (returns {permission:"allow"})
 *   postToolUse         → tool_result event         (fire-and-forget)
 *   afterAgentResponse  → assistant_text event      (fire-and-forget)
 *   beforeShellExecution → permission gate          (returns {permission:"ask"})
 *
 * Hooks that require an explicit decision (preToolUse, beforeSubmitPrompt,
 * beforeShellExecution) get the most-permissive "proceed unchanged"
 * output so they observe without enforcing. Empirically Cursor still
 * gates per its own approval policy on top — `permission:"allow"` from
 * preToolUse is advisory, not authoritative, in allowlist mode.
 *
 * All entries point at bin/kh-rts-hook. We add additively to each event
 * list so the user's existing entries (e.g. peon-ping) survive.
 * Identification is by the absolute path containing "kh-rts-hook" in the
 * entry's `command`, since Cursor doesn't appear to support shell
 * comments in `command`.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { SOCKET_PATH } from "./adapters/claude-hook";
import { getHookScriptPath, ensureHookScriptExecutable } from "./hook-installer";

const CURSOR_HOOKS_PATH = join(homedir(), ".cursor", "hooks.json");
const HOOK_MARKER = "kh-rts-hook";
const CURSOR_HOOK_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "stop",
  "beforeSubmitPrompt",
  "preToolUse",
  "postToolUse",
  "afterAgentResponse",
  "beforeShellExecution",
] as const;

type CursorHookEntry = { command: string; timeout?: number };
type CursorHooksFile = {
  version?: number;
  hooks?: Record<string, CursorHookEntry[]>;
};

function loadHooksFile(): CursorHooksFile {
  if (!existsSync(CURSOR_HOOKS_PATH)) return { version: 1, hooks: {} };
  try {
    const parsed = JSON.parse(readFileSync(CURSOR_HOOKS_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : { version: 1, hooks: {} };
  } catch {
    return { version: 1, hooks: {} };
  }
}

function saveHooksFile(file: CursorHooksFile) {
  mkdirSync(dirname(CURSOR_HOOKS_PATH), { recursive: true });
  writeFileSync(CURSOR_HOOKS_PATH, JSON.stringify(file, null, 2));
}

function isOurEntry(entry: CursorHookEntry): boolean {
  return typeof entry?.command === "string" && entry.command.includes(HOOK_MARKER);
}

export function isCursorInstalled(): boolean {
  const file = loadHooksFile();
  // Consider installed only when our entry appears under every event
  // we expect — partial install is treated as "not installed" so the
  // toggle re-installs and fixes drift.
  return CURSOR_HOOK_EVENTS.every((evt) =>
    (file.hooks?.[evt] ?? []).some(isOurEntry)
  );
}

export function installCursorHooks() {
  ensureHookScriptExecutable();
  const scriptPath = getHookScriptPath();
  // 30s is enough for fire-and-forget paths (script exits in ms after
  // sending) and for beforeShellExecution which now returns "ask"
  // immediately. The Claude PermissionRequest path runs from a
  // different config (~/.claude/settings.json) where the timeout is
  // managed separately.
  const entry: CursorHookEntry = { command: scriptPath, timeout: 30 };

  const file = loadHooksFile();
  if (file.version !== 1) file.version = 1;
  file.hooks = file.hooks ?? {};
  for (const evt of CURSOR_HOOK_EVENTS) {
    const list = (file.hooks[evt] ?? []).filter((e) => !isOurEntry(e));
    list.push(entry);
    file.hooks[evt] = list;
  }
  saveHooksFile(file);
}

export function uninstallCursorHooks() {
  const file = loadHooksFile();
  if (!file.hooks) return;
  for (const evt of CURSOR_HOOK_EVENTS) {
    const list = file.hooks[evt];
    if (!list) continue;
    file.hooks[evt] = list.filter((e) => !isOurEntry(e));
  }
  saveHooksFile(file);
}

export function getCursorHooksStatus() {
  return {
    installed: isCursorInstalled(),
    socketPath: SOCKET_PATH,
    hookScriptPath: getHookScriptPath(),
    hooksConfigPath: CURSOR_HOOKS_PATH,
  };
}
