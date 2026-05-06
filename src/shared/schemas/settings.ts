import { z } from "zod";

export const AppSettingsSchema = z.object({
  workspaceRoot: z.string(),
  exclude: z.array(z.string()),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const RawSettingsSchema = z.looseObject({
  workspaceRoot: z.string().optional(),
  exclude: z.array(z.string()).optional(),
  excludeRepos: z.array(z.string()).optional(),
});
export type RawSettings = z.infer<typeof RawSettingsSchema>;
