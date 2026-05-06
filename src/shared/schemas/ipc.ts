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

export const SpawnAgentResponseSchema = z.object({
  unitId: z.string().min(1),
  sessionId: z.string().min(1),
});
export type SpawnAgentResponse = z.infer<typeof SpawnAgentResponseSchema>;

export const ListUnitEntrySchema = z.object({
  unitId: z.string().min(1),
  sessionId: z.string().min(1),
  cwd: z.string(),
});
export type ListUnitEntry = z.infer<typeof ListUnitEntrySchema>;

export const ListUnitsResponseSchema = z.array(ListUnitEntrySchema);
export type ListUnitsResponse = z.infer<typeof ListUnitsResponseSchema>;

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

export const OpenPathResponseSchema = z.string();
export type OpenPathResponse = z.infer<typeof OpenPathResponseSchema>;

export const WorkspaceRootPathSchema = z.string();
export type WorkspaceRootPath = z.infer<typeof WorkspaceRootPathSchema>;

export const WorkspaceRepoEntrySchema = z.object({
  path: z.string(),
  label: z.string(),
});
export type WorkspaceRepoEntry = z.infer<typeof WorkspaceRepoEntrySchema>;

export const ListWorkspaceReposResponseSchema = z.array(
  WorkspaceRepoEntrySchema
);
export type ListWorkspaceReposResponse = z.infer<
  typeof ListWorkspaceReposResponseSchema
>;

export const WorkspaceRootValidationSchema = z.object({
  valid: z.boolean(),
  expanded: z.string(),
  reason: z
    .enum(["empty", "not-found", "not-a-directory", "stat-failed"])
    .optional(),
});
export type WorkspaceRootValidation = z.infer<
  typeof WorkspaceRootValidationSchema
>;

export const HooksStatusSchema = z.object({
  installed: z.boolean(),
  socketPath: z.string(),
  hookScriptPath: z.string(),
  hooksConfigPath: z.string().optional(),
  policyConfigPath: z.string().optional(),
});
export type HooksStatus = z.infer<typeof HooksStatusSchema>;

export const ResolvePermissionResponseSchema = z.boolean();
export type ResolvePermissionResponse = z.infer<
  typeof ResolvePermissionResponseSchema
>;

export { AppSettingsSchema, PersistedStateSchema };
