import type { AgentEvent } from "@shared/events";
import type { AgentMonitorRecord } from "@shared/schemas";

export type ConversationIdentity = Pick<
  AgentMonitorRecord,
  "providerId" | "nativeSessionId" | "sourceLocalId"
>;

/** Repository is context, never a conversation identity. */
export function eventMatchesAgent(
  event: AgentEvent,
  agent: ConversationIdentity
): boolean {
  if (event.tool !== agent.providerId || !agent.nativeSessionId) return false;
  const native = [
    event.payload.providerSessionId,
    event.payload.providerConversationId,
    event.payload.cursorChatId,
  ].find((value) => typeof value === "string" && value.trim());
  if (typeof native === "string")
    return native.trim() === agent.nativeSessionId;
  return (
    event.sessionId === agent.nativeSessionId ||
    event.sessionId === agent.sourceLocalId
  );
}
