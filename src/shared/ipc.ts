export const IPC = {
  EventStream: "kh:event-stream",
  SpawnAgent: "kh:spawn-agent",
  KillAgent: "kh:kill-agent",
  SendPrompt: "kh:send-prompt",
  ListUnits: "kh:list-units",
  InstallHooks: "kh:install-hooks",
  UninstallHooks: "kh:uninstall-hooks",
  HooksStatus: "kh:hooks-status",
} as const;

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
