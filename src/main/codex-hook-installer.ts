/**
 * Codex hook installer — manages a marked block in ~/.codex/config.toml.
 *
 * Codex's hook system is undocumented in the public docs but exists in
 * the Rust source (codex-rs/hooks/) and JSON schema. The shape mirrors
 * Claude's almost exactly: same event names (SessionStart, UserPromptSubmit,
 * PreToolUse, PostToolUse, PermissionRequest, Stop), same input field
 * names (snake_case session_id, cwd, hook_event_name, tool_name, tool_input),
 * same output format for PermissionRequest (`hookSpecificOutput.decision.behavior`).
 * That means our existing keykeeper-hook script's Claude path works as-is for
 * Codex too — we only need to tag events with `__kh_tool: "codex"` so the
 * bridge can attribute them to the right wielder. The installer does this
 * by appending `--tool codex` to the hook command (script reads it).
 *
 * We avoid touching the user's existing config.toml content by writing a
 * single self-contained block delimited by marker comments. Install
 * strips any existing block and appends a fresh one; uninstall just
 * strips. Round-trips preserve the rest of the file exactly.
 *
 * Permission events are synchronous (Codex must wait for our reply);
 * everything else is async fire-and-forget so we don't slow Codex down.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { SOCKET_PATH } from "./adapters/hook-bridge";
import { getHookScriptPath, ensureHookScriptExecutable } from "./hook-installer";

const CODEX_CONFIG_PATH = join(homedir(), ".codex", "config.toml");
const BLOCK_START = "# keykeeper-hooks-start (managed by keykeeper — do not edit)";
const BLOCK_END = "# keykeeper-hooks-end";

function loadConfigFile(): string {
  if (!existsSync(CODEX_CONFIG_PATH)) return "";
  return readFileSync(CODEX_CONFIG_PATH, "utf8");
}

function saveConfigFile(content: string) {
  mkdirSync(dirname(CODEX_CONFIG_PATH), { recursive: true });
  writeFileSync(CODEX_CONFIG_PATH, content);
}

function stripManagedBlock(content: string): string {
  const startIdx = content.indexOf(BLOCK_START);
  if (startIdx === -1) return content;
  const endMarkerIdx = content.indexOf(BLOCK_END, startIdx);
  if (endMarkerIdx === -1) return content;
  const endIdx = endMarkerIdx + BLOCK_END.length;
  // Also strip a trailing newline so successive install/uninstall don't
  // pile up blank lines.
  let cutEnd = endIdx;
  if (content[cutEnd] === "\n") cutEnd += 1;
  // Strip a single leading newline so the previous content stays clean.
  let cutStart = startIdx;
  if (cutStart > 0 && content[cutStart - 1] === "\n") cutStart -= 1;
  return content.slice(0, cutStart) + content.slice(cutEnd);
}

function buildBlock(scriptPath: string): string {
  const cmd = `${scriptPath} --tool codex`;
  // Each event is its own [[hooks.X]] entry with one command handler.
  // All hooks are synchronous because Codex doesn't support async hooks
  // yet (it warns "skipping async hook in ~/.codex/config.toml: async
  // hooks are not supported yet" and silently drops them). Our script
  // exits in milliseconds for fire-and-forget paths, so the blocking
  // cost is negligible. Permission events have NO timeout so Codex
  // falls back to its 600s default — a short timeout here would kill
  // the script before the King could decide in the keykeeper letter.
  const obs = (event: string) =>
    [
      `[[hooks.${event}]]`,
      `[[hooks.${event}.hooks]]`,
      `type = "command"`,
      `command = "${cmd}"`,
      `timeout = 60`,
    ].join("\n");
  const perm = (event: string) =>
    [
      `[[hooks.${event}]]`,
      `[[hooks.${event}.hooks]]`,
      `type = "command"`,
      `command = "${cmd}"`,
    ].join("\n");
  return [
    BLOCK_START,
    obs("SessionStart"),
    obs("Stop"),
    obs("UserPromptSubmit"),
    obs("PreToolUse"),
    obs("PostToolUse"),
    perm("PermissionRequest"),
    BLOCK_END,
  ].join("\n\n");
}

export function isCodexInstalled(): boolean {
  const content = loadConfigFile();
  return content.includes(BLOCK_START);
}

export function installCodexHooks() {
  ensureHookScriptExecutable();
  const scriptPath = getHookScriptPath();
  const original = loadConfigFile();
  const stripped = stripManagedBlock(original);
  const trimmed = stripped.replace(/\s*$/, "");
  const block = buildBlock(scriptPath);
  const next = trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
  saveConfigFile(next);
}

export function uninstallCodexHooks() {
  const original = loadConfigFile();
  if (!original.includes(BLOCK_START)) return;
  const stripped = stripManagedBlock(original);
  saveConfigFile(stripped);
}

export function getCodexHooksStatus() {
  return {
    installed: isCodexInstalled(),
    socketPath: SOCKET_PATH,
    hookScriptPath: getHookScriptPath(),
    hooksConfigPath: CODEX_CONFIG_PATH,
  };
}
