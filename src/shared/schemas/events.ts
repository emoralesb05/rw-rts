import { z } from "zod";
import { AgentToolSchema } from "./common";
import { PermissionOptionSchema } from "./permissions";
import { UserInputQuestionSchema } from "./user-input";

export const AgentEventKindSchema = z.enum([
  "session_start",
  "session_end",
  "user_prompt",
  "assistant_text",
  "tool_use",
  "tool_result",
  "subagent_spawn",
  "error",
  "permission_request",
  "permission_resolved",
  "user_input_request",
  "user_input_resolved",
]);
export type AgentEventKind = z.infer<typeof AgentEventKindSchema>;

export const AgentEventSourceSchema = z.enum([
  "spawned",
  "hook",
  "realmkeeper",
]);
export type AgentEventSource = z.infer<typeof AgentEventSourceSchema>;

export const AgentEventPayloadSchema = z.looseObject({
  name: z.string().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  text: z.string().optional(),
  error: z.string().optional(),
  parentSessionId: z.string().optional(),
  providerSessionId: z.string().optional(),
  providerConversationId: z.string().optional(),
  cursorChatId: z.string().optional(),
  requestId: z.string().optional(),
  permissionMode: z.enum(["actionable", "observe"]).optional(),
  permissionOptions: z.array(PermissionOptionSchema).optional(),
  questions: z.array(UserInputQuestionSchema).optional(),
  responseKind: z.literal("mcp-elicitation").optional(),
  autoResolutionMs: z.number().int().nonnegative().nullable().optional(),
  resolution: z.literal("error").optional(),
  durationMs: z.number().finite().nonnegative().optional(),
});
export type AgentEventPayload = z.infer<typeof AgentEventPayloadSchema>;

export const AgentEventSchema = z.object({
  sessionId: z.string().min(1),
  tool: AgentToolSchema,
  cwd: z.string().min(1),
  repoRoot: z.string().optional(),
  timestamp: z.number().finite().nonnegative(),
  kind: AgentEventKindSchema,
  payload: AgentEventPayloadSchema,
  source: AgentEventSourceSchema,
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;
