export type {
  AppSettings,
  FixtureScenario,
  PermissionDecision,
  PlayFixtureRequest,
  ResolvePermissionRequest,
  SendPromptRequest,
  SpawnAgentRequest,
} from "./schemas";

export const IPC = {
  EventStream: "kh:event-stream",
  SpawnAgent: "kh:spawn-agent",
  KillAgent: "kh:kill-agent",
  SendPrompt: "kh:send-prompt",
  ListUnits: "kh:list-units",
  InstallHooks: "kh:install-hooks",
  UninstallHooks: "kh:uninstall-hooks",
  HooksStatus: "kh:hooks-status",
  InstallCursorHooks: "kh:install-cursor-hooks",
  UninstallCursorHooks: "kh:uninstall-cursor-hooks",
  CursorHooksStatus: "kh:cursor-hooks-status",
  InstallCodexHooks: "kh:install-codex-hooks",
  UninstallCodexHooks: "kh:uninstall-codex-hooks",
  CodexHooksStatus: "kh:codex-hooks-status",
  InstallGeminiHooks: "kh:install-gemini-hooks",
  UninstallGeminiHooks: "kh:uninstall-gemini-hooks",
  GeminiHooksStatus: "kh:gemini-hooks-status",
  OpenPath: "kh:open-path",
  PlayFixture: "kh:play-fixture",
  LoadPersisted: "kh:load-persisted",
  SavePersisted: "kh:save-persisted",
  ResetPersisted: "kh:reset-persisted",
  ResolvePermission: "kh:resolve-permission",
  ListWorkspaceRepos: "kh:list-workspace-repos",
  GetSettings: "kh:get-settings",
  SaveSettings: "kh:save-settings",
  ValidateWorkspaceRoot: "kh:validate-workspace-root",
} as const;

export type WorkspaceRepoEntry = {
  path: string;
  label: string;
};

export type WorkspaceRootValidation = {
  valid: boolean;
  expanded: string;
  reason?: "empty" | "not-found" | "not-a-directory" | "stat-failed";
};

export type SpawnAgentResponse = {
  unitId: string;
  sessionId: string;
};

export type HooksStatus = {
  installed: boolean;
  socketPath: string;
  hookScriptPath: string;
  // Set on Cursor status — path to ~/.cursor/hooks.json so the UI can
  // surface where the entry will be written. Omitted for Claude.
  hooksConfigPath?: string;
  policyConfigPath?: string;
};
