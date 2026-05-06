import { z } from "zod";

export const CommandHookSchema = z.looseObject({
  type: z.literal("command").optional(),
  command: z.string().optional(),
  name: z.string().optional(),
  timeout: z.number().finite().nonnegative().optional(),
  description: z.string().optional(),
});
export type CommandHook = z.infer<typeof CommandHookSchema>;

export const JsonHookEntrySchema = z.looseObject({
  matcher: z.string().optional(),
  hooks: z.array(CommandHookSchema).optional(),
});
export type JsonHookEntry = z.infer<typeof JsonHookEntrySchema>;

export const ClaudeSettingsSchema = z.looseObject({
  hooks: z.record(z.string(), z.array(JsonHookEntrySchema)).optional(),
});
export type ClaudeSettings = z.infer<typeof ClaudeSettingsSchema>;

export const GeminiSettingsSchema = z.looseObject({
  hooks: z.record(z.string(), z.array(JsonHookEntrySchema)).optional(),
});
export type GeminiSettings = z.infer<typeof GeminiSettingsSchema>;

export const CursorHookEntrySchema = z.looseObject({
  command: z.string().optional(),
  timeout: z.number().finite().nonnegative().optional(),
});
export type CursorHookEntry = z.infer<typeof CursorHookEntrySchema>;

export const CursorHooksFileSchema = z.looseObject({
  version: z.number().int().positive().optional(),
  hooks: z.record(z.string(), z.array(CursorHookEntrySchema)).optional(),
});
export type CursorHooksFile = z.infer<typeof CursorHooksFileSchema>;
