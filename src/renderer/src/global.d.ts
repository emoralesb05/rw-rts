import type {
  SpawnAgentRequest,
  SpawnAgentResponse,
  SendPromptRequest,
  HooksStatus,
  ListUnitEntry,
  PlayFixtureRequest,
  ResolvePermissionRequest,
  ResolveUserInputRequest,
  WorkspaceRepoEntry,
  AppSettings,
  WorkspaceRootValidation,
} from "@shared/schemas";
import type { AgentEvent, PersistedState } from "@shared/events";
import type { seedVisualQaState } from "./dev/visual-qa-seed";
import type { useStore } from "./store";

declare global {
  interface Window {
    rw: {
      onEvent(listener: (event: AgentEvent) => void): () => void;
      spawnAgent(req: SpawnAgentRequest): Promise<SpawnAgentResponse>;
      sendPrompt(req: SendPromptRequest): Promise<void>;
      killAgent(unitId: string): Promise<void>;
      listUnits(): Promise<ListUnitEntry[]>;
      installHooks(): Promise<HooksStatus>;
      uninstallHooks(): Promise<HooksStatus>;
      hooksStatus(): Promise<HooksStatus>;
      installCursorHooks(): Promise<HooksStatus>;
      uninstallCursorHooks(): Promise<HooksStatus>;
      cursorHooksStatus(): Promise<HooksStatus>;
      installCodexHooks(): Promise<HooksStatus>;
      uninstallCodexHooks(): Promise<HooksStatus>;
      codexHooksStatus(): Promise<HooksStatus>;
      installGeminiHooks(): Promise<HooksStatus>;
      uninstallGeminiHooks(): Promise<HooksStatus>;
      geminiHooksStatus(): Promise<HooksStatus>;
      playFixture(req: PlayFixtureRequest): Promise<void>;
      openPath(
        path: string,
        opts?: { tool?: "claude" | "cursor" | "codex" | "gemini" }
      ): Promise<string>;
      loadPersisted(): Promise<PersistedState>;
      savePersisted(state: PersistedState): Promise<void>;
      resetPersisted(): Promise<PersistedState>;
      resolvePermission(req: ResolvePermissionRequest): Promise<boolean>;
      resolveUserInput(req: ResolveUserInputRequest): Promise<boolean>;
      listWorkspaceRepos(): Promise<WorkspaceRepoEntry[]>;
      getSettings(): Promise<AppSettings>;
      saveSettings(next: AppSettings): Promise<AppSettings>;
      validateWorkspaceRoot(p: string): Promise<WorkspaceRootValidation>;
    };
    __rwSeedVisualQa?: typeof seedVisualQaState;
    __rwStore?: typeof useStore;
  }
}

export {};
