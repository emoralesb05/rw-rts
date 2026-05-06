import { z } from "zod";
import { AgentToolSchema } from "./common";
import { PersistedStateSchema } from "./persisted";
import { AppSettingsSchema } from "./settings";

export const SpawnAgentRequestSchema = z.object({
  prompt: z.string(),
  cwd: z.string(),
  tool: AgentToolSchema.optional(),
  role: z.string().optional(),
  name: z.string().optional(),
});
export type SpawnAgentRequest = z.infer<typeof SpawnAgentRequestSchema>;

export const SendPromptRequestSchema = z.object({
  unitId: z.string().min(1),
  prompt: z.string(),
});
export type SendPromptRequest = z.infer<typeof SendPromptRequestSchema>;

export const PermissionDecisionSchema = z.enum(["allow", "deny"]);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const ResolvePermissionRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: PermissionDecisionSchema,
  message: z.string().optional(),
});
export type ResolvePermissionRequest = z.infer<
  typeof ResolvePermissionRequestSchema
>;

export const FixtureScenarioSchema = z.enum([
  "summon-vaelen",
  "summon-selene",
  "summon-ryder",
  "summon-lyris",
  "summon-all",
  "cursor-turn",
  "codex-shell",
  "gemini-turn",
  "subagent",
  "stress",
  "combat",
  "permission",
  "demo",
]);
export type FixtureScenario = z.infer<typeof FixtureScenarioSchema>;

export const PlayFixtureRequestSchema = z.object({
  scenario: FixtureScenarioSchema,
  cwd: z.string().optional(),
});
export type PlayFixtureRequest = z.infer<typeof PlayFixtureRequestSchema>;

export const OpenPathRequestSchema = z.object({
  path: z.string(),
  tool: AgentToolSchema.optional(),
});
export type OpenPathRequest = z.infer<typeof OpenPathRequestSchema>;

export const WorkspaceRootPathSchema = z.string();
export type WorkspaceRootPath = z.infer<typeof WorkspaceRootPathSchema>;

export { AppSettingsSchema, PersistedStateSchema };
