import type {
  SpawnAgentRequest,
  SendPromptRequest,
  HooksStatus,
  PlayFixtureRequest,
} from "@shared/ipc";
import type { AgentEvent } from "@shared/events";

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
    };
  }
}

export {};
