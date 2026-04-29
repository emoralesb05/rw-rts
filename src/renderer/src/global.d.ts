import type {
  SpawnAgentRequest,
  SendPromptRequest,
  HooksStatus,
  PlayFixtureRequest,
  ResolvePermissionRequest,
  WorkspaceRepoEntry,
  AppSettings,
  WorkspaceRootValidation,
} from "@shared/ipc";
import type { AgentEvent, PersistedState } from "@shared/events";

declare global {
  interface Window {
    kh: {
      onEvent(listener: (event: AgentEvent) => void): () => void;
      spawnAgent(req: SpawnAgentRequest): Promise<{ unitId: string; sessionId: string }>;
      sendPrompt(req: SendPromptRequest): Promise<void>;
      killAgent(unitId: string): Promise<void>;
      listUnits(): Promise<{ unitId: string; sessionId: string; cwd: string }[]>;
      installHooks(): Promise<HooksStatus>;
      uninstallHooks(): Promise<HooksStatus>;
      hooksStatus(): Promise<HooksStatus>;
      playFixture(req: PlayFixtureRequest): Promise<void>;
      loadPersisted(): Promise<PersistedState>;
      savePersisted(state: PersistedState): Promise<void>;
      resetPersisted(): Promise<PersistedState>;
      resolvePermission(req: ResolvePermissionRequest): Promise<boolean>;
      listWorkspaceRepos(): Promise<WorkspaceRepoEntry[]>;
      getSettings(): Promise<AppSettings>;
      saveSettings(next: AppSettings): Promise<AppSettings>;
      validateWorkspaceRoot(p: string): Promise<WorkspaceRootValidation>;
    };
  }
}

export {};
