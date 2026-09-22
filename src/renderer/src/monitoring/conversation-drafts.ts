import { create } from "zustand";
import type { AgentMonitorRecord, MonitorControlName } from "@shared/schemas";

type ConversationDraft = {
  prompt: string;
  busyAction?: MonitorControlName;
  result?: string;
  sentAt?: number;
};
const EMPTY: ConversationDraft = { prompt: "" };
export const conversationKey = (agent: AgentMonitorRecord) =>
  JSON.stringify([agent.providerId, agent.nativeSessionId ?? agent.agentId]);

/** App-lifetime only: prompts must not enter localStorage or monitor checkpoints. */
export const useConversationDrafts = create<{
  entries: Record<string, ConversationDraft>;
  update(key: string, patch: Partial<ConversationDraft>): void;
}>((set) => ({
  entries: {},
  update: (key, patch) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: { ...(state.entries[key] ?? EMPTY), ...patch },
      },
    })),
}));
export function draftFor(key: string): ConversationDraft {
  return useConversationDrafts.getState().entries[key] ?? EMPTY;
}
export const emptyConversationDraft = EMPTY;
