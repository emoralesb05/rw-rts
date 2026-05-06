import { z } from "zod";
import { AgentToolSchema } from "./common";

// Provider hook payloads are intentionally loose because providers add
// tool-specific fields often. Keykeeper requires only the event name and
// validates concrete fields in each normalizer.
export const HookPayloadSchema = z.looseObject({
  hook_event_name: z.string().min(1),
  __kh_tool: AgentToolSchema.optional(),
  __kh_permission_request_id: z.string().optional(),
  session_id: z.string().optional(),
  sessionId: z.string().optional(),
  conversation_id: z.string().optional(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.unknown().optional(),
  tool_response: z.unknown().optional(),
});
export type HookPayload = z.infer<typeof HookPayloadSchema>;
