export const IPC = {
  EventStream: "kh:event-stream",
  SpawnAgent: "kh:spawn-agent",
  KillAgent: "kh:kill-agent",
  SendPrompt: "kh:send-prompt",
  ListUnits: "kh:list-units",
  InstallHooks: "kh:install-hooks",
  UninstallHooks: "kh:uninstall-hooks",
  HooksStatus: "kh:hooks-status",
  PlayFixture: "kh:play-fixture",
  LoadPersisted: "kh:load-persisted",
  SavePersisted: "kh:save-persisted",
  ResetPersisted: "kh:reset-persisted",
  ResolvePermission: "kh:resolve-permission",
  ListWorkspaceRepos: "kh:list-workspace-repos",
} as const;

export type WorkspaceRepoEntry = {
  path: string;
  label: string;
};

export type PermissionDecision = "allow" | "deny";

export type ResolvePermissionRequest = {
  requestId: string;
  decision: PermissionDecision;
  // Reason shown to Claude on deny (upstream PermissionRequest hook's
  // decision.message). Allow ignores this — upstream contract has no
  // message field for allow.
  message?: string;
};

export type FixtureScenario =
  | "summon-vaelen"
  | "summon-selene"
  | "summon-ryder"
  | "summon-lyris"
  | "summon-all"
  | "cursor-turn"
  | "codex-shell"
  | "subagent"
  | "stress"
  | "combat"
  | "permission"
  | "demo";

export type PlayFixtureRequest = {
  scenario: FixtureScenario;
  cwd?: string;
};

export type SpawnAgentRequest = {
  prompt: string;
  cwd: string;
  tool?: "claude" | "cursor" | "codex";
  role?: string;
  name?: string;
};

export type SpawnAgentResponse = {
  unitId: string;
  sessionId: string;
};

export type SendPromptRequest = {
  unitId: string;
  prompt: string;
};

export type HooksStatus = {
  installed: boolean;
  socketPath: string;
  hookScriptPath: string;
};
