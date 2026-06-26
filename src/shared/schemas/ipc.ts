import { z } from "zod";
import { AgentToolSchema } from "./common";
import { PermissionDecisionSchema } from "./permissions";
import { PersistedStateSchema } from "./persisted";
import { AppSettingsSchema } from "./settings";
import { UserInputAnswersSchema } from "./user-input";

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
  sessionId: z.string().min(1).optional(),
  tool: AgentToolSchema.optional(),
  cwd: z.string().min(1).optional(),
});
export type SendPromptRequest = z.infer<typeof SendPromptRequestSchema>;

export const ResolvePermissionRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: PermissionDecisionSchema,
  optionId: z.string().optional(),
  message: z.string().optional(),
});
export type ResolvePermissionRequest = z.infer<
  typeof ResolvePermissionRequestSchema
>;

export const ResolveUserInputRequestSchema = z.object({
  requestId: z.string().min(1),
  answers: UserInputAnswersSchema,
  responseKind: z.literal("mcp-elicitation").optional(),
  responseAction: z.enum(["accept", "decline", "cancel"]).optional(),
});
export type ResolveUserInputRequest = z.infer<
  typeof ResolveUserInputRequestSchema
>;

export const FixtureScenarioSchema = z.enum([
  "summon-vaelen",
  "summon-selene",
  "summon-ryder",
  "summon-lyris",
  "summon-all",
  "cursor-turn",
  "codex-shell",
  "codex-inputs",
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

export const ResolveUserInputResponseSchema = z.boolean();
export type ResolveUserInputResponse = z.infer<
  typeof ResolveUserInputResponseSchema
>;

export { AppSettingsSchema, PersistedStateSchema };
