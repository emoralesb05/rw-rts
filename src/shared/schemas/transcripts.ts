import { z } from "zod";

export const ClaudeTranscriptContentBlockSchema = z.looseObject({
  type: z.string().optional(),
  text: z.string().optional(),
});

export const ClaudeTranscriptLineSchema = z.looseObject({
  type: z.string().optional(),
  uuid: z.string().optional(),
  requestId: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  message: z
    .looseObject({
      content: z.array(ClaudeTranscriptContentBlockSchema).optional(),
    })
    .optional(),
});
export type ClaudeTranscriptLine = z.infer<typeof ClaudeTranscriptLineSchema>;

export const CodexTranscriptLineSchema = z.looseObject({
  type: z.string().optional(),
  cwd: z.string().optional(),
  item: z.unknown().optional(),
  payload: z.unknown().optional(),
});
export type CodexTranscriptLine = z.infer<typeof CodexTranscriptLineSchema>;
