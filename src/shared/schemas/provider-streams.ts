import { z } from "zod";

export const ProviderStreamMessageSchema = z.looseObject({});
export type ProviderStreamMessage = z.infer<typeof ProviderStreamMessageSchema>;

export const CodexThreadStartedSchema = z.looseObject({
  type: z.literal("thread.started"),
  thread_id: z.string().min(1),
});
export type CodexThreadStarted = z.infer<typeof CodexThreadStartedSchema>;

export const GeminiInitMessageSchema = z.looseObject({
  type: z.literal("init"),
  session_id: z.string().min(1),
});
export type GeminiInitMessage = z.infer<typeof GeminiInitMessageSchema>;

export function parseProviderStreamMessage(
  line: string
): ProviderStreamMessage | null {
  try {
    const parsed = ProviderStreamMessageSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
